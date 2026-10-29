import { randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { AppError } from '../../common/errors/AppError';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshTokenWithJti,
  verifyRefreshToken,
  normalizeEmail,
} from './auth.utils';
import { assertPasswordPolicy } from './password-policy';
import type { UserShape } from '../user/user.service';
import { sendDiscordDirectMessage } from '../../common/integrations/discord.util';

// Exported: other files import * as authService (and now the Pothos schema imports
// this type directly), so TypeScript needs to be able to name it.
//
// `user` is typed as the FULL UserShape, not a narrow { id, email, firstName, lastName }
// subset — Prisma's create()/findUnique() already return every scalar column by default,
// so role/imageUrl/taxResidency/isActive/createdAt were always present on the actual
// object at runtime; the old narrow type just didn't admit it, which meant TypeScript
// would (wrongly) flag `user.role` as an error anywhere this type was used directly.
export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  user: UserShape;
}

async function issueTokens(userId: string, tokenVersion: number) {
  const jti = randomUUID();
  const accessToken = signAccessToken(userId, tokenVersion);
  const refreshToken = signRefreshTokenWithJti(userId, tokenVersion, jti);
  return { accessToken, refreshToken };
}

async function revokeJti(jti: string, exp: number): Promise<void> {
  const ttlSeconds = exp - Math.floor(Date.now() / 1000);
  if (ttlSeconds > 0) {
    await redis.set(`revoked_jti:${jti}`, '1', 'EX', ttlSeconds);
  }
}

// Login brute-force guard: lock an email out after too many wrong passwords in a row,
// rather than per-request limiting, since credential-stuffing targets one account.
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_LOCKOUT_WINDOW_SECONDS = 15 * 60;

function loginFailKey(email: string): string {
  return `login-fail:${email}`;
}

async function assertLoginNotLocked(email: string): Promise<void> {
  const attempts = await redis.get(loginFailKey(email));
  if (attempts && Number(attempts) >= MAX_LOGIN_ATTEMPTS) {
    throw AppError.tooManyRequests('Too many failed login attempts. Try again in a few minutes.');
  }
}

async function recordLoginFailure(email: string): Promise<void> {
  const key = loginFailKey(email);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, LOGIN_LOCKOUT_WINDOW_SECONDS);
  }
}

async function clearLoginFailures(email: string): Promise<void> {
  await redis.del(loginFailKey(email));
}

export async function register(
  email: string,
  password: string,
  firstName?: string,
  lastName?: string,
): Promise<AuthPayload> {
  assertPasswordPolicy(password);
  const normalizedEmail = normalizeEmail(email);

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw AppError.conflict('An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email: normalizedEmail, passwordHash, firstName, lastName } });

  const tokens = await issueTokens(user.id, user.tokenVersion);
  return { ...tokens, user };
}

export async function login(email: string, password: string): Promise<AuthPayload> {
  const normalizedEmail = normalizeEmail(email);
  await assertLoginNotLocked(normalizedEmail);

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || user.deletedAt || !user.isActive) {
    await recordLoginFailure(normalizedEmail);
    throw AppError.unauthorized('Invalid email or password');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordLoginFailure(normalizedEmail);
    throw AppError.unauthorized('Invalid email or password');
  }

  await clearLoginFailures(normalizedEmail);
  const tokens = await issueTokens(user.id, user.tokenVersion);
  return { ...tokens, user };
}

export async function refreshAccessToken(refreshToken: string): Promise<AuthPayload> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token');
  }

  const isRevoked = await redis.get(`revoked_jti:${payload.jti}`);
  if (isRevoked) {
    throw AppError.unauthorized('This session has been revoked');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.deletedAt || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
    throw AppError.unauthorized('Invalid or expired refresh token');
  }

  await revokeJti(payload.jti, payload.exp);
  const tokens = await issueTokens(user.id, user.tokenVersion);
  return { ...tokens, user };
}

export async function logout(refreshToken: string): Promise<boolean> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await revokeJti(payload.jti, payload.exp);
  } catch {
    // Already invalid or expired — logging out is a no-op, not an error.
  }
  return true;
}

export async function revokeAllSessions(userId: string): Promise<boolean> {
  await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  return true;
}

export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User not found');

  const valid = await verifyPassword(oldPassword, user.passwordHash);
  if (!valid) {
    // Not UNAUTHORIZED: the session is fine, the input isn't. Clients treat
    // UNAUTHORIZED as "session ended" and log the user out.
    throw AppError.badRequest('Current password is incorrect');
  }

  assertPasswordPolicy(newPassword);
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });

  return true;
}

// There's no email provider configured, so the reset code is delivered over Discord DM
// (the account must already be linked via /link) instead of a mailed link.
const RESET_TOKEN_TTL_SECONDS = 15 * 60;

function resetTokenKey(token: string): string {
  return `password-reset:${token}`;
}

export async function forgotPassword(email: string): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (user && !user.deletedAt && user.isActive && user.discordUserId) {
    const token = randomUUID();
    await redis.set(resetTokenKey(token), user.id, 'EX', RESET_TOKEN_TTL_SECONDS);
    const minutes = RESET_TOKEN_TTL_SECONDS / 60;
    try {
      await sendDiscordDirectMessage(
        user.discordUserId,
        `🔑 โค้ดตั้งรหัสผ่านใหม่ของคุณ (หมดอายุใน ${minutes} นาที):\n\`${token}\`\n\nถ้าไม่ได้ขอ ไม่ต้องทำอะไร`,
      );
    } catch (err) {
      console.error('Failed to send password reset DM:', err);
    }
  }

  // Always report success — revealing whether the email exists or is Discord-linked
  // would let an attacker enumerate accounts.
  return true;
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  assertPasswordPolicy(newPassword);

  const key = resetTokenKey(token);
  const userId = await redis.get(key);
  if (!userId) {
    throw AppError.badRequest('This reset code is invalid or has expired');
  }
  await redis.del(key);

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });

  return true;
}
