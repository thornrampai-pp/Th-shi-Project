// ⚠️ INTEGRATION TEST — hits a REAL PostgreSQL database and Redis via the app's own
// config modules. Not run by `npm test` by default:
//
//   npm run test:integration
//
// Point DATABASE_URL/REDIS_URL at disposable/test instances before running this — it
// creates and deletes real rows, scoped to the users it creates.
import { describe, it, expect } from "vitest";
import { prisma } from "../../config/prisma";
import { redis } from "../../config/redis";
import { AppError } from "../../common/errors/AppError";
import * as authService from "./auth.service";
import { runIntegrationTests } from "../../test-utils/integration";

const PASSWORD = "correct-password-123";

async function registerTestUser(emailOverride?: string) {
  const email = emailOverride ?? `auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const payload = await authService.register(email, PASSWORD);
  return { email, userId: payload.user.id };
}

async function cleanup(userId: string) {
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

describe.skipIf(!runIntegrationTests)("auth.service (real DB + Redis)", () => {
  describe("register", () => {
    it("normalizes the email to lowercase before storing it", async () => {
      const mixedCase = `Mixed-Case-${Date.now()}@Test.Local`;
      const payload = await authService.register(mixedCase, PASSWORD);
      expect(payload.user.email).toBe(mixedCase.toLowerCase());
      await cleanup(payload.user.id);
    });

    it("rejects a duplicate email regardless of case", async () => {
      const { email, userId } = await registerTestUser();
      await expect(authService.register(email.toUpperCase(), PASSWORD)).rejects.toThrow(/already exists/i);
      await cleanup(userId);
    });
  });

  describe("login", () => {
    it("rejects a wrong password without revealing which part was wrong", async () => {
      const { email, userId } = await registerTestUser();
      await expect(authService.login(email, "wrong-password")).rejects.toThrow(/invalid email or password/i);
      await cleanup(userId);
    });

    it("is case-insensitive on the email", async () => {
      const { email, userId } = await registerTestUser();
      const payload = await authService.login(email.toUpperCase(), PASSWORD);
      expect(payload.user.id).toBe(userId);
      await cleanup(userId);
    });

    it("locks the account out after too many failed attempts, and a correct login clears it", async () => {
      const { email, userId } = await registerTestUser();

      for (let i = 0; i < 10; i++) {
        await expect(authService.login(email, "wrong-password")).rejects.toThrow();
      }

      let locked: unknown;
      try {
        await authService.login(email, PASSWORD);
      } catch (err) {
        locked = err;
      }
      expect(locked).toBeInstanceOf(AppError);
      expect((locked as AppError).code).toBe("TOO_MANY_REQUESTS");

      await redis.del(`login-fail:${email.toLowerCase()}`);
      const payload = await authService.login(email, PASSWORD);
      expect(payload.user.id).toBe(userId);

      await cleanup(userId);
    });
  });

  describe("changePassword", () => {
    it("rejects the wrong current password", async () => {
      const { userId } = await registerTestUser();
      await expect(authService.changePassword(userId, "not-the-password", "new-password-123")).rejects.toThrow(
        /current password is incorrect/i,
      );
      await cleanup(userId);
    });

    it("updates the password and bumps tokenVersion (revoking existing sessions)", async () => {
      const { email, userId } = await registerTestUser();
      const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

      await authService.changePassword(userId, PASSWORD, "new-password-123");

      const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(after.tokenVersion).toBe(before.tokenVersion + 1);
      await expect(authService.login(email, PASSWORD)).rejects.toThrow();
      const relogged = await authService.login(email, "new-password-123");
      expect(relogged.user.id).toBe(userId);

      await cleanup(userId);
    });
  });

  describe("forgotPassword / resetPassword", () => {
    it("always returns true for an email that doesn't exist (no enumeration)", async () => {
      await expect(authService.forgotPassword("no-such-user@test.local")).resolves.toBe(true);
    });

    it("returns true without sending a DM when the account has no Discord linked", async () => {
      const { email, userId } = await registerTestUser();
      await expect(authService.forgotPassword(email)).resolves.toBe(true);
      await cleanup(userId);
    });

    it("rejects an invalid or expired reset code", async () => {
      await expect(authService.resetPassword("not-a-real-token", "new-password-123")).rejects.toThrow(
        /invalid or has expired/i,
      );
    });

    it("resets the password from a token, consumes it, and revokes sessions", async () => {
      const { email, userId } = await registerTestUser();
      const token = "test-reset-token";
      await redis.set(`password-reset:${token}`, userId, "EX", 60);

      await expect(authService.resetPassword(token, "brand-new-password-123")).resolves.toBe(true);

      // The token is single-use.
      await expect(authService.resetPassword(token, "another-password-123")).rejects.toThrow(/invalid or has expired/i);

      await expect(authService.login(email, PASSWORD)).rejects.toThrow();
      const relogged = await authService.login(email, "brand-new-password-123");
      expect(relogged.user.id).toBe(userId);

      await cleanup(userId);
    });
  });

  describe("refreshAccessToken / logout", () => {
    it("issues a new token pair and revokes the old refresh token", async () => {
      const { userId } = await registerTestUser();
      const initial = await authService.login(
        (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email,
        PASSWORD,
      );

      const refreshed = await authService.refreshAccessToken(initial.refreshToken);
      expect(refreshed.user.id).toBe(userId);

      // The old refresh token was single-use — reusing it is rejected.
      await expect(authService.refreshAccessToken(initial.refreshToken)).rejects.toThrow();

      await cleanup(userId);
    });

    it("logout revokes the refresh token so it can no longer be used", async () => {
      const { userId } = await registerTestUser();
      const session = await authService.login(
        (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email,
        PASSWORD,
      );

      await expect(authService.logout(session.refreshToken)).resolves.toBe(true);
      await expect(authService.refreshAccessToken(session.refreshToken)).rejects.toThrow();

      await cleanup(userId);
    });
  });

  describe("revokeAllSessions", () => {
    it("bumps tokenVersion so previously issued tokens stop refreshing", async () => {
      const { userId } = await registerTestUser();
      const session = await authService.login(
        (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email,
        PASSWORD,
      );

      await authService.revokeAllSessions(userId);
      await expect(authService.refreshAccessToken(session.refreshToken)).rejects.toThrow();

      await cleanup(userId);
    });
  });
});
