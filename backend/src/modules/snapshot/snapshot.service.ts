import { prisma } from "../../config/prisma";
import { assertPortfolioOwnership } from "../../common/utils/portfolio-ownership.util";
import { HOME_CURRENCY, createRateResolver } from "../fx/fx.service";
import { endOfUtcDay, utcDay } from "../../common/utils/date.util";
import { replayPositions } from "./replay";

/** Currency that cross-portfolio totals (net worth, combined dashboard) are reported in. */
export const REPORTING_CURRENCY = HOME_CURRENCY;

export type SnapshotGranularityValue = "DAILY" | "MONTHLY" | "YEARLY";

interface PositionValuation {
  assetId: string;
  symbol: string;
  name: string;
  /** The asset's trading currency (prices below are already in the portfolio's). */
  assetCurrency: string;
  quantity: number;
  avgPrice: number;
  marketPrice: number;
  marketValue: number;
  costBasis: number;
  realizedPL: number;
  totalDiv: number;
}

interface PortfolioValuation {
  cash: number;
  positions: PositionValuation[];
  positionsMarketValue: number;
  costBasis: number;
  unrealizedPL: number;
  realizedPL: number;
  totalDividend: number;
  equity: number;
  currency: string;
}

/**
 * The one place portfolio value gets computed — used by createSnapshot(), the
 * dashboard, and net worth, so all three always agree with each other.
 *
 * Valued AS OF a point in time (default: now), using only what was known then:
 * - positions are replayed from transactions executed up to `asOf` (replay.ts)
 * - cash is the sum of CASH ledger entries whose transaction executed up to `asOf`
 * - prices are the last daily close on or before `asOf` (falls back to avg cost)
 * - FX is the ExchangeRate for that day (live rate when `asOf` is today)
 *
 * Every figure is in the portfolio's baseCurrency.
 */
async function valuatePortfolio(
  portfolioId: string,
  asOf: Date = new Date(),
): Promise<PortfolioValuation> {
  const [portfolio, cashAccounts, transactions, cashEntries] = await Promise.all([
    prisma.portfolio.findUniqueOrThrow({ where: { id: portfolioId } }),
    prisma.cashAccount.findMany({ where: { portfolioId } }),
    prisma.transaction.findMany({
      where: { portfolioId, status: "COMPLETED", executedAt: { lte: asOf } },
    }),
    prisma.ledgerEntry.findMany({
      where: {
        portfolioId,
        accountType: "CASH",
        transaction: { status: "COMPLETED", executedAt: { lte: asOf } },
      },
      select: { cashAccountId: true, side: true, amount: true },
    }),
  ]);

  const baseCurrency = portfolio.baseCurrency;
  const rateTo = createRateResolver(asOf);

  const balanceByAccount = new Map<string, number>();
  for (const entry of cashEntries) {
    if (!entry.cashAccountId) continue;
    const signed = entry.side === "DEBIT" ? Number(entry.amount) : -Number(entry.amount);
    balanceByAccount.set(entry.cashAccountId, (balanceByAccount.get(entry.cashAccountId) ?? 0) + signed);
  }

  const cashParts = await Promise.all(
    cashAccounts.map(async (ca) => {
      const balance = balanceByAccount.get(ca.id) ?? 0;
      return balance === 0 ? 0 : balance * (await rateTo(ca.currency, baseCurrency));
    }),
  );
  const cash = cashParts.reduce((sum, value) => sum + value, 0);

  const replayed = replayPositions(
    transactions.map((t) => ({
      type: t.type,
      executedAt: t.executedAt,
      createdAt: t.createdAt,
      mainAssetId: t.mainAssetId,
      mainQuantity: t.mainQuantity != null ? Number(t.mainQuantity) : null,
      mainPrice: t.mainPrice != null ? Number(t.mainPrice) : null,
      fee: Number(t.fee),
      baseCurrAmount: t.baseCurrAmount != null ? Number(t.baseCurrAmount) : null,
      metadata: t.metadata,
    })),
    asOf,
  );

  const assets = await prisma.asset.findMany({
    where: { id: { in: [...replayed.keys()] } },
  });
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const valuations: PositionValuation[] = await Promise.all(
    [...replayed.values()].map(async (position) => {
      const asset = assetById.get(position.assetId)!;
      const fx = await rateTo(asset.currency, baseCurrency);
      let marketPrice = position.avgPrice; // fallback when no price history exists

      if (position.quantity > 0) {
        const close = await prisma.assetPrice.findFirst({
          where: { assetId: position.assetId, timeframe: "1D", timestamp: { lte: asOf } },
          orderBy: { timestamp: "desc" },
        });
        if (close) marketPrice = Number(close.closePrice);
      }

      return {
        assetId: position.assetId,
        symbol: asset.symbol,
        name: asset.name,
        assetCurrency: asset.currency,
        quantity: position.quantity,
        avgPrice: position.avgPrice * fx,
        marketPrice: marketPrice * fx,
        marketValue: position.quantity * marketPrice * fx,
        costBasis: position.quantity * position.avgPrice * fx,
        realizedPL: position.realizedPL * fx,
        totalDiv: position.totalDiv * fx,
      };
    }),
  );

  const positionsMarketValue = valuations.reduce(
    (sum, v) => sum + v.marketValue,
    0,
  );
  const costBasis = valuations.reduce((sum, v) => sum + v.costBasis, 0);
  // realizedPL/totalDividend are cumulative across every position ever held, including
  // fully-closed ones (quantity = 0) — that history doesn't disappear once fully sold.
  const realizedPL = valuations.reduce((sum, v) => sum + v.realizedPL, 0);
  const totalDividend = valuations.reduce((sum, v) => sum + v.totalDiv, 0);
  const unrealizedPL = positionsMarketValue - costBasis;
  const equity = cash + positionsMarketValue;

  return {
    cash,
    positions: valuations,
    positionsMarketValue,
    costBasis,
    unrealizedPL,
    realizedPL,
    totalDividend,
    equity,
    currency: baseCurrency,
  };
}

/**
 * Creates (or replaces) the snapshot for one portfolio on one UTC day. A snapshot
 * dated D values the portfolio at the END of D (or now, if D is today), with that
 * day's prices and FX — so rebuilding a past day always gives the same result.
 *
 * netCashFlow and twrReturn are relative to the PREVIOUS snapshot at the same
 * granularity — a single-period Time-Weighted Return (HPR); chaining sub-periods into
 * a cumulative TWR happens in getPortfolioPerformance().
 */
export async function createSnapshot(
  portfolioId: string,
  date: Date,
  granularity: SnapshotGranularityValue = "DAILY",
) {
  const day = utcDay(date);
  const asOf = new Date(Math.min(endOfUtcDay(day).getTime(), Date.now()));
  const valuation = await valuatePortfolio(portfolioId, asOf);

  const previousSnapshot = await prisma.portfolioSnapshot.findFirst({
    where: { portfolioId, granularity, date: { lt: day } },
    orderBy: { date: "desc" },
  });

  const periodStart = previousSnapshot ? endOfUtcDay(previousSnapshot.date) : new Date(0);
  const cashMovements = await prisma.transaction.findMany({
    where: {
      portfolioId,
      status: "COMPLETED",
      type: { in: ["DEPOSIT", "WITHDRAW"] },
      executedAt: { gt: periodStart, lte: asOf },
    },
  });
  const rateTo = createRateResolver(asOf);
  let netCashFlow = 0;
  for (const t of cashMovements) {
    const amount = t.baseCurrAmount != null ? Number(t.baseCurrAmount) : 0;
    const meta = (t.metadata ?? {}) as { currency?: string };
    const fx = await rateTo(meta.currency ?? valuation.currency, valuation.currency);
    netCashFlow += (t.type === "DEPOSIT" ? amount : -amount) * fx;
  }

  // HPR = (EndValue - NetCashFlow - BeginValue) / BeginValue — the standard
  // Time-Weighted Return formula for a single sub-period. No previous snapshot (or a
  // zero starting balance) means there's no meaningful "return" for day one, so 0.
  const beginValue = previousSnapshot ? Number(previousSnapshot.equity) : null;
  const twrReturn =
    beginValue != null && beginValue > 0
      ? ((valuation.equity - netCashFlow - beginValue) / beginValue) * 100
      : 0;

  const data = {
    equity: valuation.equity,
    cash: valuation.cash,
    unrealizedPL: valuation.unrealizedPL,
    realizedPL: valuation.realizedPL,
    totalDividend: valuation.totalDividend,
    costBasis: valuation.costBasis,
    netCashFlow,
    twrReturn,
  };

  return prisma.portfolioSnapshot.upsert({
    where: { portfolioId_date_granularity: { portfolioId, date: day, granularity } },
    update: data,
    create: { portfolioId, date: day, granularity, ...data },
  });
}

export async function listSnapshots(
  userId: string,
  portfolioId: string,
  granularity: SnapshotGranularityValue,
  from: Date,
  to: Date,
) {
  await assertPortfolioOwnership(userId, portfolioId);
  return prisma.portfolioSnapshot.findMany({
    where: { portfolioId, granularity, date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });
}

export async function triggerSnapshot(userId: string, portfolioId: string) {
  await assertPortfolioOwnership(userId, portfolioId);
  return createSnapshot(portfolioId, new Date(), "DAILY");
}

/**
 * Chains each DAILY snapshot's single-period twrReturn geometrically —
 * (1+r1)*(1+r2)*...*(1+rn) - 1 — into a cumulative Time-Weighted Return over [from, to].
 * This is what makes TWR correct across deposits/withdrawals happening mid-period,
 * unlike a naive (endEquity - startEquity) / startEquity calculation would be.
 */
export async function getPortfolioPerformance(
  userId: string,
  portfolioId: string,
  from: Date,
  to: Date,
) {
  await assertPortfolioOwnership(userId, portfolioId);

  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: { portfolioId, granularity: "DAILY", date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });

  if (snapshots.length === 0) {
    return {
      totalReturn: 0,
      twr: 0,
      cagr: 0,
      unrealizedPL: 0,
      realizedPL: 0,
      totalDividend: 0,
    };
  }

  const cumulativeGrowth = snapshots.reduce(
    (acc, s) => acc * (1 + Number(s.twrReturn) / 100),
    1,
  );

  const twr = (cumulativeGrowth - 1) * 100;

  const first = snapshots.at(0);
  const last = snapshots.at(-1);

  if (!first || !last) {
    return {
      totalReturn: 0,
      twr: 0,
      cagr: 0,
      unrealizedPL: 0,
      realizedPL: 0,
      totalDividend: 0,
    };
  }

  const days = Math.max(
    1,
    (last.date.getTime() - first.date.getTime()) / (1000 * 60 * 60 * 24),
  );

  const years = days / 365;

  const cagr =
    years > 0 && cumulativeGrowth > 0
      ? (Math.pow(cumulativeGrowth, 1 / years) - 1) * 100
      : 0;

  return {
    totalReturn: twr,
    twr,
    cagr,
    unrealizedPL: Number(last.unrealizedPL),
    realizedPL: Number(last.realizedPL),
    totalDividend: Number(last.totalDividend),
  };
}

/**
 * Sums the latest snapshot's equity across every portfolio the user owns. Each
 * snapshot is in its portfolio's baseCurrency, so it's converted to THB before adding.
 */
export async function getNetWorth(userId: string) {
  const portfolios = await prisma.portfolio.findMany({
    where: { userId, deletedAt: null },
  });

  const rateTo = createRateResolver();
  const convertedEquities = await Promise.all(
    portfolios.map(async (p) => {
      const snapshot = await prisma.portfolioSnapshot.findFirst({
        where: { portfolioId: p.id, granularity: "DAILY" },
        orderBy: { date: "desc" },
      });
      if (!snapshot) return 0;
      return Number(snapshot.equity) * (await rateTo(p.baseCurrency, REPORTING_CURRENCY));
    }),
  );

  const total = convertedEquities.reduce((sum, value) => sum + value, 0);
  return { total, currency: REPORTING_CURRENCY, asOf: new Date().toISOString() };
}

/** The one screen-level query — combines Snapshot + Position data in one round trip. */
export async function getDashboard(userId: string, portfolioId?: string) {
  if (portfolioId) {
    await assertPortfolioOwnership(userId, portfolioId);
  }

  const portfolios = portfolioId
    ? [await prisma.portfolio.findUniqueOrThrow({ where: { id: portfolioId } })]
    : await prisma.portfolio.findMany({ where: { userId, deletedAt: null } });

  const rawValuations = await Promise.all(
    portfolios.map((p) => valuatePortfolio(p.id)),
  );

  // One portfolio → report in its own currency. Several → convert each to THB first.
  const currency =
    portfolioId && rawValuations[0] ? rawValuations[0].currency : REPORTING_CURRENCY;
  const rateTo = createRateResolver();
  const valuations = await Promise.all(
    rawValuations.map(async (v) => {
      const fx = await rateTo(v.currency, currency);
      return {
        equity: v.equity * fx,
        unrealizedPL: v.unrealizedPL * fx,
        realizedPL: v.realizedPL * fx,
        totalDividend: v.totalDividend * fx,
        positions: v.positions.map((p) => ({ ...p, marketValue: p.marketValue * fx })),
      };
    }),
  );

  const netWorth = valuations.reduce((sum, v) => sum + v.equity, 0);
  const pl = valuations.reduce(
    (sum, v) => sum + v.unrealizedPL + v.realizedPL,
    0,
  );
  const dividendYtd = await getDividendYtd(
    portfolios.map((p) => ({ id: p.id, baseCurrency: p.baseCurrency })),
    currency,
  );

  const allocationMap = new Map<string, number>();
  for (const valuation of valuations) {
    for (const position of valuation.positions) {
      if (position.quantity <= 0) continue;
      allocationMap.set(
        position.symbol,
        (allocationMap.get(position.symbol) ?? 0) + position.marketValue,
      );
    }
  }

  return {
    currency,
    netWorth,
    portfolioValue: netWorth,
    pl,
    dividendYtd,
    assetAllocation: Array.from(allocationMap.entries()).map(
      ([symbol, value]) => ({ symbol, value }),
    ),
  };
}

export interface HoldingSummary {
  assetId: string;
  symbol: string;
  name: string;
  assetCurrency: string;
  quantity: number;
  avgPrice: number;
  marketPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  unrealizedPLPct: number;
  /** Share of the portfolio's holdings market value (cash excluded), in %. */
  weight: number;
}

export interface PortfolioHoldingsSummary {
  portfolioId: string;
  name: string;
  strategy: string;
  type: string;
  currency: string;
  cash: number;
  equity: number;
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  unrealizedPLPct: number;
  realizedPL: number;
  totalDividend: number;
  holdings: HoldingSummary[];
}

function percentOf(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** Open positions only, largest first; all figures in the portfolio's baseCurrency. */
function summarizeHoldings(
  portfolio: { id: string; name: string; strategy: string; type: string },
  valuation: PortfolioValuation,
): PortfolioHoldingsSummary {
  const holdings = valuation.positions
    .filter((p) => p.quantity > 0)
    .map((p) => ({
      assetId: p.assetId,
      symbol: p.symbol,
      name: p.name,
      assetCurrency: p.assetCurrency,
      quantity: p.quantity,
      avgPrice: p.avgPrice,
      marketPrice: p.marketPrice,
      marketValue: p.marketValue,
      costBasis: p.costBasis,
      unrealizedPL: p.marketValue - p.costBasis,
      unrealizedPLPct: percentOf(p.marketValue - p.costBasis, p.costBasis),
      weight: percentOf(p.marketValue, valuation.positionsMarketValue),
    }))
    .sort((a, b) => b.marketValue - a.marketValue);

  return {
    portfolioId: portfolio.id,
    name: portfolio.name,
    strategy: portfolio.strategy,
    type: portfolio.type,
    currency: valuation.currency,
    cash: valuation.cash,
    equity: valuation.equity,
    marketValue: valuation.positionsMarketValue,
    costBasis: valuation.costBasis,
    unrealizedPL: valuation.unrealizedPL,
    unrealizedPLPct: percentOf(valuation.unrealizedPL, valuation.costBasis),
    realizedPL: valuation.realizedPL,
    totalDividend: valuation.totalDividend,
    holdings,
  };
}

export async function getPortfolioHoldings(userId: string, portfolioId: string) {
  const portfolio = await assertPortfolioOwnership(userId, portfolioId);
  return summarizeHoldings(portfolio, await valuatePortfolio(portfolioId));
}

/**
 * Every portfolio's holdings (each in its own baseCurrency) plus combined totals
 * converted to THB — the numbers behind the portfolio overview screen.
 */
export async function getPortfolioOverview(userId: string) {
  const portfolios = await prisma.portfolio.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  const summaries = await Promise.all(
    portfolios.map(async (p) => summarizeHoldings(p, await valuatePortfolio(p.id))),
  );

  const rateTo = createRateResolver();
  const converted = await Promise.all(
    summaries.map(async (s) => {
      const fx = await rateTo(s.currency, REPORTING_CURRENCY);
      return {
        marketValue: s.marketValue * fx,
        costBasis: s.costBasis * fx,
        unrealizedPL: s.unrealizedPL * fx,
        realizedPL: s.realizedPL * fx,
      };
    }),
  );
  const sum = (pick: (c: (typeof converted)[number]) => number) =>
    converted.reduce((acc, c) => acc + pick(c), 0);

  const costBasis = sum((c) => c.costBasis);
  const unrealizedPL = sum((c) => c.unrealizedPL);

  return {
    currency: REPORTING_CURRENCY,
    marketValue: sum((c) => c.marketValue),
    costBasis,
    unrealizedPL,
    unrealizedPLPct: percentOf(unrealizedPL, costBasis),
    realizedPL: sum((c) => c.realizedPL),
    portfolios: summaries,
  };
}

/**
 * Dividends received since Jan 1 of the current year. Previously this summed
 * Position.totalDiv, which is lifetime-to-date, not year-to-date.
 * DIVIDEND transactions store baseCurrAmount in the cash account's currency, which is
 * recorded in metadata.currency (falls back to the portfolio's base currency).
 */
async function getDividendYtd(
  portfolios: { id: string; baseCurrency: string }[],
  targetCurrency: string,
): Promise<number> {
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const rateTo = createRateResolver();

  const perPortfolio = await Promise.all(
    portfolios.map(async (p) => {
      const dividends = await prisma.transaction.findMany({
        where: { portfolioId: p.id, type: "DIVIDEND", executedAt: { gte: yearStart } },
      });
      let total = 0;
      for (const d of dividends) {
        const meta = (d.metadata ?? {}) as { currency?: string };
        const fx = await rateTo(meta.currency ?? p.baseCurrency, targetCurrency);
        total += Number(d.baseCurrAmount ?? 0) * fx;
      }
      return total;
    }),
  );

  return perPortfolio.reduce((sum, value) => sum + value, 0);
}
