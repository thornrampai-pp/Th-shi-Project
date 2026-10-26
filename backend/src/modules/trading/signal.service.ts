import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/AppError";
import { assertPortfolioOwnership } from "../../common/utils/portfolio-ownership.util";
import { placeOrder } from "./order.service";
import type { OrderTypeValue } from "./order.service";

export type SignalTypeValue = "BUY" | "SELL" | "HOLD";

export interface CreateSignalInput {
  portfolioId: string;
  assetId: string;
  signalType: SignalTypeValue;
  price: number;
  strength?: number;
  source?: string;
  metadata?: unknown;
}

async function getOwnedSignalOrThrow(userId: string, id: string) {
  const signal = await prisma.tradingSignal.findUnique({ where: { id }, include: { portfolio: true } });
  if (!signal || signal.portfolio.userId !== userId || signal.portfolio.deletedAt) {
    throw AppError.notFound("Trading signal not found");
  }
  return signal;
}

/**
 * Signals come from an external strategy (Python bot, CLI) authenticated as the
 * portfolio owner. They're advisory only — nothing trades until executeSignal().
 */
export async function createTradingSignal(userId: string, input: CreateSignalInput) {
  await assertPortfolioOwnership(userId, input.portfolioId);

  if (!(input.price > 0)) throw AppError.badRequest("price must be positive");
  if (input.strength != null && (input.strength < 0 || input.strength > 1)) {
    throw AppError.badRequest("strength must be between 0 and 1");
  }

  const asset = await prisma.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) throw AppError.notFound("Asset not found");

  return prisma.tradingSignal.create({
    data: {
      portfolioId: input.portfolioId,
      assetId: input.assetId,
      signalType: input.signalType,
      price: input.price,
      strength: input.strength,
      source: input.source,
      metadata: input.metadata ?? undefined,
    },
    include: { asset: true },
  });
}

export async function listTradingSignals(
  userId: string,
  portfolioId: string,
  filters: { isExecuted?: boolean; limit?: number },
) {
  await assertPortfolioOwnership(userId, portfolioId);
  return prisma.tradingSignal.findMany({
    where: { portfolioId, isExecuted: filters.isExecuted },
    include: { asset: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.limit ?? 50, 200),
  });
}

/** Turns a BUY/SELL signal into an order. The signal is marked executed once that order fills. */
export async function executeSignal(
  userId: string,
  id: string,
  input: { quantity: number; orderType?: OrderTypeValue; limitPrice?: number },
) {
  const signal = await getOwnedSignalOrThrow(userId, id);
  if (signal.signalType === "HOLD") throw AppError.badRequest("HOLD signals can't be executed");
  if (signal.isExecuted) throw AppError.badRequest("This signal was already executed");

  return placeOrder(userId, {
    portfolioId: signal.portfolioId,
    assetId: signal.assetId,
    side: signal.signalType,
    orderType: input.orderType ?? "MARKET",
    quantity: input.quantity,
    limitPrice: input.limitPrice,
    signalId: signal.id,
  });
}

/** Marks a signal as handled without trading on it. */
export async function dismissSignal(userId: string, id: string) {
  await getOwnedSignalOrThrow(userId, id);
  return prisma.tradingSignal.update({ where: { id }, data: { isExecuted: true }, include: { asset: true } });
}
