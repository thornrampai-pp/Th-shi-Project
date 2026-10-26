import { prisma } from "../../config/prisma";
import { assertPortfolioOwnership } from "../../common/utils/portfolio-ownership.util";
import { HOME_CURRENCY, resolveHomeFxRate } from "../fx/fx.service";
import { getLatestPrice } from "../asset/asset.service";
import { splitPL } from "./fx-pl";
import type { FxLot } from "./fx-pl";

export interface PositionFxBreakdown {
  assetId: string;
  symbol: string;
  currency: string;
  quantity: number;
  marketPrice: number | null;
  currentFxRate: number | null;
  // Unrealized (open lots) — null when a price or rate is unavailable.
  costBasis: number;
  costBasisHome: number | null;
  marketValueHome: number | null;
  unrealizedPLHome: number | null;
  unrealizedStockPLHome: number | null;
  unrealizedFxPLHome: number | null;
  // Realized (cumulative, from Position)
  realizedPLHome: number;
  realizedStockPLHome: number;
  realizedFxPLHome: number;
}

export interface PortfolioFxBreakdown {
  homeCurrency: string;
  positions: PositionFxBreakdown[];
  totals: {
    unrealizedPLHome: number;
    unrealizedStockPLHome: number;
    unrealizedFxPLHome: number;
    realizedPLHome: number;
    realizedStockPLHome: number;
    realizedFxPLHome: number;
    /** False when some position's unrealized split is missing from the totals. */
    complete: boolean;
  };
}

/**
 * Per position: how much of the P/L (in THB) came from the stock price and how much
 * from the exchange rate — unrealized from the open tax lots valued at the latest
 * price and today's rate, realized from the Position accumulators written by SELL.
 */
export async function getPortfolioFxBreakdown(userId: string, portfolioId: string): Promise<PortfolioFxBreakdown> {
  const portfolio = await assertPortfolioOwnership(userId, portfolioId);

  const [positions, openLots] = await Promise.all([
    prisma.position.findMany({ where: { portfolioId }, include: { asset: true } }),
    prisma.taxLot.findMany({
      where: { portfolioId, remainingQty: { gt: 0 } },
      orderBy: { executedAt: "asc" },
    }),
  ]);

  const now = new Date();
  const result: PositionFxBreakdown[] = [];

  for (const position of positions) {
    const asset = position.asset;
    const quantity = Number(position.quantity);
    const lots = openLots.filter((lot) => lot.assetId === position.assetId);

    const fxLots: FxLot[] = [];
    let ratesComplete = true;
    for (const lot of lots) {
      const rate =
        lot.purchaseFxRate != null
          ? Number(lot.purchaseFxRate)
          : await resolveHomeFxRate(portfolio, asset.currency, lot.executedAt).catch(() => null);
      if (rate == null) ratesComplete = false;
      else fxLots.push({ quantity: Number(lot.remainingQty), unitCost: Number(lot.purchasePrice), fxRate: rate });
    }

    const costBasis = lots.reduce((sum, lot) => sum + Number(lot.remainingQty) * Number(lot.purchasePrice), 0);
    const marketPrice = quantity > 0 ? await getLatestPrice(asset) : null;
    const currentFxRate = await resolveHomeFxRate(portfolio, asset.currency, now).catch(() => null);

    const split =
      quantity > 0 && ratesComplete && marketPrice != null && currentFxRate != null
        ? splitPL(fxLots, quantity * marketPrice, currentFxRate)
        : null;

    result.push({
      assetId: asset.id,
      symbol: asset.symbol,
      currency: asset.currency,
      quantity,
      marketPrice,
      currentFxRate,
      costBasis,
      costBasisHome: split?.costBasisHome ?? (quantity === 0 ? 0 : null),
      marketValueHome: split?.valueHome ?? (quantity === 0 ? 0 : null),
      unrealizedPLHome: split?.plHome ?? (quantity === 0 ? 0 : null),
      unrealizedStockPLHome: split?.stockPLHome ?? (quantity === 0 ? 0 : null),
      unrealizedFxPLHome: split?.fxPLHome ?? (quantity === 0 ? 0 : null),
      realizedPLHome: Number(position.realizedPLHome),
      realizedStockPLHome: Number(position.realizedStockPLHome),
      realizedFxPLHome: Number(position.realizedFxPLHome),
    });
  }

  const sum = (pick: (p: PositionFxBreakdown) => number | null) =>
    result.reduce((acc, p) => acc + (pick(p) ?? 0), 0);

  return {
    homeCurrency: HOME_CURRENCY,
    positions: result,
    totals: {
      unrealizedPLHome: sum((p) => p.unrealizedPLHome),
      unrealizedStockPLHome: sum((p) => p.unrealizedStockPLHome),
      unrealizedFxPLHome: sum((p) => p.unrealizedFxPLHome),
      realizedPLHome: sum((p) => p.realizedPLHome),
      realizedStockPLHome: sum((p) => p.realizedStockPLHome),
      realizedFxPLHome: sum((p) => p.realizedFxPLHome),
      complete: result.every((p) => p.unrealizedPLHome != null),
    },
  };
}
