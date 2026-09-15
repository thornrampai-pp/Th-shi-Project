import { prisma } from '../../config/prisma';
import { AppError } from '../../common/errors/AppError';

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

export async function deactivateAccount(userId: string): Promise<boolean> {
  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false, deletedAt: new Date(), tokenVersion: { increment: 1 } },
  });
  return true;
}
