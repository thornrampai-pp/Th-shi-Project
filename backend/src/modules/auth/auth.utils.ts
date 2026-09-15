import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

const SALT_ROUNDS = 12;

export interface RefreshTokenPayload {
  sub: string; // userId
  tokenVersion: number;
  jti: string; // unique id per refresh token, lets us revoke a single session
  exp: number;
}

export interface AccessTokenPayload {
  sub: string;
  tokenVersion: number;
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
