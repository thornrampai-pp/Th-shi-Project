import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { config } from './config'; 

export class TokenService {
  static generateAccessToken(userId: string): string {
    return jwt.sign({ userId }, config.jwt.accessSecret, { expiresIn: '15m' });
  }

  static generateRefreshToken(userId: string, tokenVersion: number): string {
    return jwt.sign({ userId, tokenVersion }, config.jwt.refreshSecret, { expiresIn: '7d' });
  }

  static sendRefreshToken(res: Response, token: string): void {
    res.cookie('toshi_jid', token, {
      httpOnly: true,
      path: '/graphql',
      secure: config.isProduction, 
      sameSite: 'lax',
    });
  }

  static clearRefreshToken(res: Response): void {
    res.clearCookie('toshi_jid', { path: '/graphql' });
  }
}