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
} from './auth.utils';
import type { UserShape } from '../user/user.service';

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

export async function register(
  email: string,
  password: string,
  firstName?: string,
  lastName?: string,
): Promise<AuthPayload> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw AppError.conflict('An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, passwordHash, firstName, lastName } });

  const tokens = await issueTokens(user.id, user.tokenVersion);
  return { ...tokens, user };
}

export async function login(email: string, password: string): Promise<AuthPayload> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.deletedAt || !user.isActive) {
    throw AppError.unauthorized('Invalid email or password');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw AppError.unauthorized('Invalid email or password');
  }

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
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const valid = await verifyPassword(oldPassword, user.passwordHash);
  if (!valid) {
    throw AppError.unauthorized('Current password is incorrect');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });

  return true;
}
