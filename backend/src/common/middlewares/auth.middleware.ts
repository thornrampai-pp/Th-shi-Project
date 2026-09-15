import { Request } from 'express';
import { prisma } from '../../config/prisma';
import { AppError } from '../errors/AppError';
import { verifyAccessToken } from '../../modules/auth/auth.utils';

export interface GraphQLContext {
  userId: string | null;
  prisma: typeof prisma;
}

/**
 * Builds the per-request GraphQL context from the Authorization header.
 * Also re-checks tokenVersion against the DB so a password change or
 * revokeAllSessions() call invalidates already-issued access tokens
 * within one request round trip, not just at their natural expiry.
 */
export async function buildContext({ req }: { req: Request }): Promise<GraphQLContext> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return { userId: null, prisma };
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true, isActive: true, deletedAt: true },
    });

    if (!user || user.deletedAt || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      return { userId: null, prisma };
    }

    return { userId: payload.sub, prisma };
  } catch {
    return { userId: null, prisma };
  }
}

export function requireAuth(context: GraphQLContext): string {
  if (!context.userId) {
    throw AppError.unauthorized('You must be logged in to perform this action');
  }
  return context.userId;
}
