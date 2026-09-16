import { prisma } from '../../config/prisma';
import { AppError } from '../errors/AppError';

// No explicit return type annotation — TypeScript infers it from prisma.portfolio.findUnique()
// itself, so this file never needs to import a `Portfolio` type from Prisma directly.
export async function assertPortfolioOwnership(userId: string, portfolioId: string) {
  const portfolio = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!portfolio || portfolio.userId !== userId || portfolio.deletedAt) {
    throw AppError.notFound('Portfolio not found');
  }
  return portfolio;
}
