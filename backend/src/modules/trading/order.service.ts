import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/AppError";
import { acquireOnceLock } from "../../common/utils/cache.util";
import { redis } from "../../config/redis";
import { assertPortfolioOwnership } from "../../common/utils/portfolio-ownership.util";
import { buildInvestmentEmbed } from "../../common/integrations/discord.util";
import { getLatestPrice } from "../asset/asset.service";
import { createTransaction } from "../transaction/transaction.service";
import { notifyEvent } from "../notification/notification.service";

export type OrderSideValue = "BUY" | "SELL";
export type OrderTypeValue = "MARKET" | "LIMIT";
export type OrderStatusValue = "PENDING" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED";

export interface PlaceOrderInput {
  portfolioId: string;
  assetId: string;
  side: OrderSideValue;
  orderType: OrderTypeValue;
  quantity: number;
  limitPrice?: number;
  signalId?: string;
}

const OPEN_STATUSES: OrderStatusValue[] = ["PENDING", "PARTIALLY_FILLED"];
const FILL_LOCK_TTL_SECONDS = 60;

const orderInclude = { asset: true } as const;

async function getOwnedOrderOrThrow(userId: string, id: string) {
  const order = await prisma.order.findUnique({ where: { id }, include: { portfolio: true, asset: true } });
  if (!order || order.portfolio.userId !== userId || order.portfolio.deletedAt) {
    throw AppError.notFound("Order not found");
  }
  return order;
}

export async function listOrders(userId: string, portfolioId: string, status?: OrderStatusValue) {
  await assertPortfolioOwnership(userId, portfolioId);
  return prisma.order.findMany({
    where: { portfolioId, status },
    include: orderInclude,
    orderBy: { submittedAt: "desc" },
  });
}

export async function getOrder(userId: string, id: string) {
  await getOwnedOrderOrThrow(userId, id);
  return prisma.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
}

/**
 * Creates an order. PAPER portfolios are simulated: MARKET fills immediately at the
 * live price ± paperSlippageBps with paperCommissionRate as fee; LIMIT fills as soon
 * as the price crosses (now, or later via the pending-orders job). REAL portfolios
 * have no broker integration, so the order stays PENDING until the user records the
 * actual execution with fillOrder().
 */
export async function placeOrder(userId: string, input: PlaceOrderInput) {
  const portfolio = await assertPortfolioOwnership(userId, input.portfolioId);

  if (!(input.quantity > 0)) throw AppError.badRequest("quantity must be positive");
  if (input.orderType === "LIMIT" && !(input.limitPrice != null && input.limitPrice > 0)) {
    throw AppError.badRequest("LIMIT orders require a positive limitPrice");
  }

  const asset = await prisma.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) throw AppError.notFound("Asset not found");

  if (input.signalId) {
    const signal = await prisma.tradingSignal.findUnique({ where: { id: input.signalId } });
    if (!signal || signal.portfolioId !== input.portfolioId) {
      throw AppError.notFound("Trading signal not found in this portfolio");
    }
  }

  const order = await prisma.order.create({
    data: {
      portfolioId: input.portfolioId,
      assetId: input.assetId,
      signalId: input.signalId,
      side: input.side,
      orderType: input.orderType,
      quantity: input.quantity,
      limitPrice: input.orderType === "LIMIT" ? input.limitPrice : null,
    },
  });

  if (portfolio.type === "PAPER") {
    await tryFillPaperOrder(order.id);
  }

  return getOrder(userId, order.id);
}

/** Records the real execution of a REAL-portfolio order (price/fee from the broker statement). */
export async function fillOrder(
  userId: string,
  id: string,
  fill: { fillPrice: number; fee?: number; executedAt?: Date },
) {
  const order = await getOwnedOrderOrThrow(userId, id);
  if (order.portfolio.type === "PAPER") {
    throw AppError.badRequest("PAPER orders are filled automatically by the simulator");
  }
  if (!(fill.fillPrice > 0)) throw AppError.badRequest("fillPrice must be positive");

  await executeFill(order.id, fill.fillPrice, fill.fee ?? 0, fill.executedAt, { rejectOnFailure: false });
  return getOrder(userId, id);
}

export async function cancelOrder(userId: string, id: string) {
  const order = await getOwnedOrderOrThrow(userId, id);

  const { count } = await prisma.order.updateMany({
    where: { id: order.id, status: { in: OPEN_STATUSES } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (count === 0) {
    throw AppError.badRequest(`Only open orders can be cancelled (this one is ${order.status})`);
  }

  return getOrder(userId, id);
}

/**
 * Fills a paper order if its price condition is met. Returns true when filled.
 * Used right after placeOrder() and by the pending-orders cron job.
 */
export async function tryFillPaperOrder(orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { portfolio: true, asset: true },
  });
  if (!order || !OPEN_STATUSES.includes(order.status) || order.portfolio.type !== "PAPER") {
    return false;
  }

  const marketPrice = await getLatestPrice(order.asset);
  if (marketPrice == null) {
    if (order.orderType === "MARKET") {
      await markRejected(order.id, `No price available for ${order.asset.symbol}`);
    }
    return false;
  }

  const limit = order.limitPrice != null ? Number(order.limitPrice) : null;
  if (order.orderType === "LIMIT" && limit != null) {
    const crossed = order.side === "BUY" ? marketPrice <= limit : marketPrice >= limit;
    if (!crossed) return false;
  }

  const slippage = (order.portfolio.paperSlippageBps ?? 0) / 10_000;
  let fillPrice = order.side === "BUY" ? marketPrice * (1 + slippage) : marketPrice * (1 - slippage);
  // A limit order never fills worse than its limit, slippage included.
  if (limit != null) {
    fillPrice = order.side === "BUY" ? Math.min(fillPrice, limit) : Math.max(fillPrice, limit);
  }

  const remainingQty = Number(order.quantity) - Number(order.filledQty);
  const commissionRate = Number(order.portfolio.paperCommissionRate ?? 0);
  const fee = round(remainingQty * fillPrice * commissionRate, 8);

  return executeFill(order.id, round(fillPrice, 8), fee, undefined, { rejectOnFailure: true });
}

/**
 * Turns an order into a real BUY/SELL Transaction (ledger, position, tax lots — the
 * same path as manual entry), then marks it FILLED. A Redis lock prevents the user
 * and the cron job from filling the same order twice concurrently.
 */
async function executeFill(
  orderId: string,
  fillPrice: number,
  fee: number,
  executedAt: Date | undefined,
  options: { rejectOnFailure: boolean },
): Promise<boolean> {
  const lockKey = `order-fill-lock:${orderId}`;
  if (!(await acquireOnceLock(lockKey, FILL_LOCK_TTL_SECONDS))) {
    throw AppError.conflict("This order is already being filled");
  }

  try {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { portfolio: true, asset: true },
    });
    if (!OPEN_STATUSES.includes(order.status)) {
      throw AppError.badRequest(`Order is already ${order.status}`);
    }

    const quantity = Number(order.quantity) - Number(order.filledQty);

    let transaction;
    try {
      transaction = await createTransaction(order.portfolio.userId, {
        portfolioId: order.portfolioId,
        type: order.side,
        assetId: order.assetId,
        quantity,
        price: fillPrice,
        fee,
        executedAt,
        note: `order:${order.id}`,
      });
    } catch (err) {
      if (options.rejectOnFailure && err instanceof AppError && err.code === "BAD_REQUEST") {
        await markRejected(order.id, err.message);
        return false;
      }
      throw err;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "FILLED",
        filledQty: order.quantity,
        avgFillPrice: fillPrice,
        filledAt: transaction.executedAt,
        transactionId: transaction.id,
      },
    });

    if (order.signalId) {
      await prisma.tradingSignal.update({ where: { id: order.signalId }, data: { isExecuted: true } });
    }

    notifyEvent(order.portfolio.userId, "ORDER_FILLED", {
      embeds: [
        buildInvestmentEmbed({
          title: `${order.side === "BUY" ? "🟢" : "🔴"} Order filled: ${order.side} ${order.asset.symbol}`,
          color: order.side === "BUY" ? 0x2ecc71 : 0xe74c3c,
          fields: [
            { name: "Quantity", value: String(quantity), inline: true },
            { name: "Price", value: fillPrice.toLocaleString(), inline: true },
            { name: "Fee", value: fee.toLocaleString(), inline: true },
            { name: "Portfolio", value: order.portfolio.name },
          ],
        }),
      ],
    }).catch((err) => console.error("❌ Failed to send order notification:", err));

    return true;
  } finally {
    await redis.del(lockKey);
  }
}

async function markRejected(orderId: string, reason: string) {
  console.warn(`⚠️ Order ${orderId} rejected: ${reason}`);
  await prisma.order.updateMany({
    where: { id: orderId, status: { in: OPEN_STATUSES } },
    data: { status: "REJECTED", cancelledAt: new Date() },
  });
}

/** Cron entry point: retries every open LIMIT order in PAPER portfolios. */
export async function processPendingPaperOrders(): Promise<number> {
  const orders = await prisma.order.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      portfolio: { type: "PAPER", deletedAt: null },
    },
    select: { id: true },
    orderBy: { submittedAt: "asc" },
  });

  let filled = 0;
  for (const { id } of orders) {
    try {
      if (await tryFillPaperOrder(id)) filled += 1;
    } catch (err) {
      console.error(`❌ Paper order ${id} processing failed:`, err);
    }
  }
  return filled;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
