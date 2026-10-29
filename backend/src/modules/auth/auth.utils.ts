import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

const SALT_ROUNDS = 12;

export interface RefreshTokenPayload {
  sub: string;
  tokenVersion: number;
  jti: string;
  exp: number;
}

export interface AccessTokenPayload {
  sub: string;
  tokenVersion: number;
}

/** Postgres' unique constraint on User.email is case-sensitive, so callers must
 * normalize before every lookup/create or "Foo@bar.com" and "foo@bar.com" become
 * two different accounts. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ sub: userId, tokenVersion }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function signRefreshTokenWithJti(userId: string, tokenVersion: number, jti: string): string {
  return jwt.sign({ sub: userId, tokenVersion, jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}
