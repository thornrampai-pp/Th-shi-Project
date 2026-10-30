import { prisma } from "../../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../common/errors/AppError";
import { assertPortfolioOwnership } from "../../common/utils/portfolio-ownership.util";
import { getPortfolioHoldings } from "../snapshot/snapshot.service";
import { logAuditEvent } from "../audit/audit.service";

export interface RebalanceDriftItem {
  assetId: string;
  symbol: string;
  currentWeight: number;
  targetWeight: number;
  /** currentWeight - targetWeight, in percentage points. */
  driftPct: number;
  marketValue: number;
  /** 0 if the position was fully sold and has no recent quote. */
  marketPrice: number;
  /** +buy / -sell, in the portfolio's currency. */
  suggestedValue: number;
  /** Null when marketPrice is 0 — there's a target but nothing to price the trade with. */
  suggestedQuantity: number | null;
}

export interface RebalanceDriftReport {
  portfolioId: string;
  currency: string;
  /** Basis the target %s are measured against — total holdings market value (cash excluded),
   * matching the `weight` field on PortfolioHoldingsSummary. */
  totalValue: number;
  items: RebalanceDriftItem[];
}

/**
 * Compares each position's current weight (share of holdings market value) against
 * its configured targetWeight, and suggests the buy/sell needed to close the gap.
 * Read-only — nothing here places an order or writes a RebalanceLog.
 */
export async function getRebalanceDrift(
  userId: string,
  portfolioId: string,
): Promise<RebalanceDriftReport> {
  const holdings = await getPortfolioHoldings(userId, portfolioId);

  const positions = await prisma.position.findMany({
    where: { portfolioId, targetWeight: { not: null } },
    select: { assetId: true, targetWeight: true, asset: { select: { symbol: true } } },
  });

  if (positions.length === 0) {
    throw AppError.badRequest(
      "No position in this portfolio has a target weight set yet — call setPositionTargetWeight first",
    );
  }

  const totalValue = holdings.marketValue;
  const holdingByAsset = new Map(holdings.holdings.map((h) => [h.assetId, h]));

  const items: RebalanceDriftItem[] = positions.map((position) => {
    const targetWeight = Number(position.targetWeight);
    const holding = holdingByAsset.get(position.assetId);
    const currentWeight = holding?.weight ?? 0;
    const marketValue = holding?.marketValue ?? 0;
    const marketPrice = holding?.marketPrice ?? 0;
    const suggestedValue = (targetWeight / 100) * totalValue - marketValue;

    return {
      assetId: position.assetId,
      symbol: holding?.symbol ?? position.asset.symbol,
      currentWeight,
      targetWeight,
      driftPct: currentWeight - targetWeight,
      marketValue,
      marketPrice,
      suggestedValue,
      suggestedQuantity: marketPrice > 0 ? suggestedValue / marketPrice : null,
    };
  });

  return { portfolioId, currency: holdings.currency, totalValue, items };
}

/**
 * Snapshots the current drift into a RebalanceLog — a record that "as of now, this
 * is how far off target the portfolio was", for later reference. Doesn't place or
 * suggest executing any trade; the caller records their own BUY/SELL transactions
 * separately after acting on the drift report.
 */
export async function recordRebalance(userId: string, portfolioId: string, description?: string) {
  await assertPortfolioOwnership(userId, portfolioId);
  const drift = await getRebalanceDrift(userId, portfolioId);

  const log = await prisma.rebalanceLog.create({
    data: {
      portfolioId,
      totalValueBefore: drift.totalValue,
      driftBefore: drift.items as unknown as Prisma.InputJsonValue,
      description,
    },
  });

  logAuditEvent(userId, "FORCE_REBALANCE", { portfolioId, rebalanceLogId: log.id }).catch((err) => {
    console.error("❌ Failed to write audit log for FORCE_REBALANCE:", err);
  });

  return log;
}

export async function listRebalanceLogs(
  userId: string,
  portfolioId: string,
  pagination: { limit?: number; offset?: number } = {},
) {
  await assertPortfolioOwnership(userId, portfolioId);

  return prisma.rebalanceLog.findMany({
    where: { portfolioId },
    orderBy: { executedAt: "desc" },
    take: Math.min(pagination.limit ?? 20, 100),
    skip: pagination.offset ?? 0,
  });
}
