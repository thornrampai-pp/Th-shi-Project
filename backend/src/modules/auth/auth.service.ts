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

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
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

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
    },
  });

  const tokens = await issueTokens(user.id, user.tokenVersion);

  return { ...tokens, user };
}

export async function login(email: string, password: string): Promise<AuthPayload> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Same error for "no such user" and "wrong password" — don't leak which one it was
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

  // Rotate on every refresh: burn the old token, issue a fresh pair.
  // Limits the blast radius if a refresh token ever leaks.
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
  // Bumping tokenVersion invalidates every access + refresh token issued
  // before this moment, across all devices, in one write.
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
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
    data: { passwordHash, tokenVersion: { increment: 1 } }, // kills every other session too
  });

  return true;
}
