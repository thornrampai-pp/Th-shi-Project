import jwt from "jsonwebtoken";
import { Response } from "express";
import { env } from "../config/env";

export class TokenService {
  static generateAccessToken(userId: string): string {
    return jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
  }

  static generateRefreshToken(userId: string, tokenVersion: number): string {
    return jwt.sign({ userId, tokenVersion }, env.JWT_REFRESH_SECRET, {
      expiresIn: "7d",
    });
  }

  static sendRefreshToken(res: Response, token: string): void {
    res.cookie("toshi_jid", token, {
      httpOnly: true,
      path: "/graphql",
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
    });
  }

  static clearRefreshToken(res: Response): void {
    res.clearCookie("toshi_jid", { path: "/graphql" });
  }
}
