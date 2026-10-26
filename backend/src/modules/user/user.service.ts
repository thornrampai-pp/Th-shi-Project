import { randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { AppError } from '../../common/errors/AppError';

// The domain shape of a User as returned by this service — exported so the GraphQL
// layer (user.schema.ts) and other services that hand back a user object (like
// auth.service.ts's AuthPayload) can reference the real shape instead of a narrower,
// inaccurate one.
export interface UserShape {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  role: string;
  taxResidency: string;
  isActive: boolean;
  createdAt: Date;
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw AppError.notFound('User not found');
  }
  return user;
}

export async function updateProfile(
  userId: string,
  data: { firstName?: string; lastName?: string; imageUrl?: string; taxResidency?: string },
) {
  return prisma.user.update({ where: { id: userId }, data });
}

const DISCORD_LINK_CODE_TTL_SECONDS = 60 * 10; // 10 minutes

/**
 * Generates a short-lived code the user pastes into Discord's /link command to prove
 * they own both accounts. Stored in Redis (not Postgres) — it's a one-time, disposable
 * credential, not durable state.
 */
export async function generateDiscordLinkCode(userId: string): Promise<string> {
  const code = randomUUID().slice(0, 8).toUpperCase();
  await redis.set(`discord-link:${code}`, userId, 'EX', DISCORD_LINK_CODE_TTL_SECONDS);
  return code;
}

export async function deactivateAccount(userId: string): Promise<boolean> {
  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false, deletedAt: new Date(), tokenVersion: { increment: 1 } },
  });
  return true;
}
