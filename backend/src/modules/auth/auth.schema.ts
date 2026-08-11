import { builder } from "../../graphql/builder";
import { prisma } from "../../config/prisma";
import { TokenService } from "../../lib/jwt";
import { AuthService } from "./auth.service";
import { UserType } from "../user/user.schema";
import type { User } from "@prisma/client";

interface AuthPayloadShape {
  accessToken: string;
  user: User;
}

const AuthPayloadType = builder
  .objectRef<AuthPayloadShape>("AuthPayload")
  .implement({
    fields: (t) => ({
      accessToken: t.exposeString("accessToken"),
      user: t.field({
        type: UserType,
        resolve: (parent) => parent.user,
      }),
    }),
  });

// 2. ด่านการเปิดยิงคิวรี่เช็คโปรไฟล์ของตนเอง (Query 'me')
builder.queryField("me", (t) =>
  t.field({
    type: UserType,
    nullable: true,
    resolve: async (_root, _args, context) => {
      if (!context.userId) return null;
      return prisma.user.findUnique({ where: { id: context.userId } });
    },
  }),
);

// 3. รวมพลังสร้างกลุ่มคำสั่งกลายพันธุ์ (Mutations)
builder.mutationFields((t) => ({
  register: t.field({
    type: AuthPayloadType,
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
      firstName: t.arg.string(),
      lastName: t.arg.string(),
    },
    resolve: async (_root, args, context) => {
      const { email, password, firstName, lastName } = args;

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) throw new Error("Email already in use");

      const passwordHash = await AuthService.hashPassword(password);

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: firstName ?? null,
          lastName: lastName ?? null,
        },
      });

      const accessToken = TokenService.generateAccessToken(user.id);
      const refreshToken = TokenService.generateRefreshToken(
        user.id,
        user.tokenVersion,
      );
      TokenService.sendRefreshToken(context.res, refreshToken);

      return { accessToken, user };
    },
  }),

  login: t.field({
    type: AuthPayloadType,
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
    },
    resolve: async (_root, { email, password }, context) => {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) throw new Error("Invalid credentials");

      const isPasswordValid = await AuthService.verifyPassword(
        password,
        user.passwordHash,
      );
      if (!isPasswordValid) throw new Error("Invalid credentials");

      const accessToken = TokenService.generateAccessToken(user.id);
      const refreshToken = TokenService.generateRefreshToken(
        user.id,
        user.tokenVersion,
      );
      TokenService.sendRefreshToken(context.res, refreshToken);

      return { accessToken, user };
    },
  }),

  logout: t.field({
    type: builder.objectRef<{ success: boolean }>("LogoutResponse").implement({
      fields: (t) => ({ success: t.exposeBoolean("success") }),
    }),
    resolve: async (_root, _args, context) => {
      TokenService.clearRefreshToken(context.res);
      return { success: true };
    },
  }),
  refreshToken: t.field({
    type: builder
      .objectRef<{ accessToken: string }>("RefreshTokenResponse")
      .implement({
        fields: (t) => ({ accessToken: t.exposeString("accessToken") }),
      }),
    resolve: async (_root, _args, context) => {
      // 1. ดึงคุกกี้ที่เคยฝากไว้ในเบราว์เซอร์ออกมาดู
      const token = context.req.cookies.toshi_jid;
      if (!token) throw new Error("No refresh token provided");

      let payload: any = null;
      try {
        // 2. แกะโค้ดตรวจสอบความถูกต้องและเช็ควันหมดอายุ
        const secret = require("../../lib/config").config.jwt.refreshSecret; // ดึงคีย์ผ่าน config ตัวเก่ง
        const jwt = require("jsonwebtoken");
        payload = jwt.verify(token, secret);
      } catch (err) {
        throw new Error("Invalid or expired refresh token");
      }

      // 3. ตรวจสอบว่าผู้ใช้งานคนนี้ยังมีตัวตนอยู่ในระบบไหม
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });
      if (!user) throw new Error("User no longer exists");

      /**
       * 4. 🌟 ไม้เด็ดความปลอดภัย: เช็ค Token Version
       * ถ้าผู้ใช้เคยสั่งเปลี่ยนรหัสผ่าน หรือสั่ง Logout จากทุกอุปกรณ์ ค่า tokenVersion ใน DB จะอัปเดตเพิ่มขึ้น
       * ทำให้ Refresh Token ใบเก่าที่แฮกเกอร์อาจจะขโมยไป กลายเป็นของปลอมทันที!
       */
      if (user.tokenVersion !== payload.tokenVersion) {
        throw new Error("Token version mismatch (Revoked)");
      }

      // 5. ปั๊ม Access Token ใบใหม่เอี่ยมส่งกลับไปให้หน้าบ้านรันต่อ
      const newAccessToken = TokenService.generateAccessToken(user.id);

      // (Optional) จะหมุนคุกกี้ Refresh Token ใบใหม่ส่งกลับไปด้วยเลยเพื่อยืดอายุ 7 วันต่อก็ได้ครับ
      const newRefreshToken = TokenService.generateRefreshToken(
        user.id,
        user.tokenVersion,
      );
      TokenService.sendRefreshToken(context.res, newRefreshToken);

      return { accessToken: newAccessToken };
    },
  }),

  // 🚫 เตะออกจากระบบทุกเครื่อง (Revoke All Sessions)
  revokeSessions: t.field({
    type: builder
      .objectRef<{ success: boolean }>("RevokeSessionsResponse")
      .implement({
        fields: (t) => ({ success: t.exposeBoolean("success") }),
      }),
    resolve: async (_root, _args, context) => {
      // ต้องล็อกอินเข้ามาก่อนถึงจะสั่งล้างเซสชันตัวเองได้
      if (!context.userId) throw new Error("Unauthorized");

      /**
       * 🌟 หัวใจสำคัญ: เพิ่มเลเวล tokenVersion + 1
       * Refresh Token ใบเดิมที่ผู้ใช้ถืออยู่ (รวมถึงเครื่องอื่นๆ)
       * จะกลายเป็นตั๋วปลอมทันทีเมื่อวิ่งไปชนกับบล็อก 'refreshToken'
       */
      await prisma.user.update({
        where: { id: context.userId },
        data: { tokenVersion: { increment: 1 } },
      });

      // สั่งเคลียร์คุกกี้เครื่องปัจจุบันทิ้งไปด้วยเลย
      TokenService.clearRefreshToken(context.res);
      return { success: true };
    },
  }),

  // 📬 ลืมรหัสผ่าน (Forgot Password)
  forgotPassword: t.field({
    type: builder
      .objectRef<{ success: boolean }>("ForgotPasswordResponse")
      .implement({
        fields: (t) => ({ success: t.exposeBoolean("success") }),
      }),
    args: {
      email: t.arg.string({ required: true }),
    },
    resolve: async (_root, { email }) => {
      const user = await prisma.user.findUnique({ where: { email } });

      // 💡 ความปลอดภัย: ต่อให้ไม่เจออีเมล ก็บอกว่า "success: true" ไป
      // เพื่อป้องกันไม่ให้แฮกเกอร์มายิงสุ่มเพื่อเช็คว่ามีอีเมลใครอยู่ในระบบบ้าง (User Enumeration)
      if (!user) return { success: true };

      // TODO: สร้างรหัสผ่านชั่วคราว หรือสร้าง Password Reset Token
      // แล้วยิงเข้า Service ส่งเมล (เช่น Nodemailer / SendGrid)

      return { success: true };
    },
  }),
}));
