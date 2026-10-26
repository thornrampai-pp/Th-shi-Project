import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/AppError";

const watchListInclude = {
  items: { include: { asset: true }, orderBy: { createdAt: "asc" } },
} as const;

async function getOwnedWatchListOrThrow(userId: string, id: string) {
  const watchList = await prisma.watchList.findUnique({ where: { id } });
  if (!watchList || watchList.userId !== userId) {
    throw AppError.notFound("Watchlist not found");
  }
  return watchList;
}

export async function listWatchLists(userId: string) {
  return prisma.watchList.findMany({
    where: { userId },
    include: watchListInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function getWatchList(userId: string, id: string) {
  await getOwnedWatchListOrThrow(userId, id);
  return prisma.watchList.findUniqueOrThrow({ where: { id }, include: watchListInclude });
}

export async function createWatchList(userId: string, name: string) {
  if (!name.trim()) throw AppError.badRequest("name is required");
  return prisma.watchList.create({ data: { userId, name: name.trim() }, include: watchListInclude });
}

export async function renameWatchList(userId: string, id: string, name: string) {
  await getOwnedWatchListOrThrow(userId, id);
  if (!name.trim()) throw AppError.badRequest("name is required");
  return prisma.watchList.update({ where: { id }, data: { name: name.trim() }, include: watchListInclude });
}

export async function deleteWatchList(userId: string, id: string): Promise<boolean> {
  await getOwnedWatchListOrThrow(userId, id);
  await prisma.watchList.delete({ where: { id } });
  return true;
}

/** Adds an asset, or updates its note if it's already on the list. */
export async function addWatchListItem(userId: string, watchListId: string, assetId: string, note?: string) {
  await getOwnedWatchListOrThrow(userId, watchListId);

  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw AppError.notFound("Asset not found");

  await prisma.watchListItem.upsert({
    where: { watchListId_assetId: { watchListId, assetId } },
    update: { note },
    create: { watchListId, assetId, note },
  });

  return getWatchList(userId, watchListId);
}

export async function removeWatchListItem(userId: string, watchListId: string, assetId: string) {
  await getOwnedWatchListOrThrow(userId, watchListId);
  await prisma.watchListItem.deleteMany({ where: { watchListId, assetId } });
  return getWatchList(userId, watchListId);
}
