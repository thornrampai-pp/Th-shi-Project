import { prisma } from "../../config/prisma";
import { getOrSetCache } from "../../common/utils/cache.util";
import { AppError } from "../../common/errors/AppError";
import { fetchYahooInsights, yahooSymbolOf } from "../../common/integrations/yahoo-finance.util";
import type { YahooInsightsSummary } from "../../common/integrations/yahoo-finance.util";

// Stats, analyst views and profiles change slowly — one Yahoo call per asset per 6h.
const INSIGHTS_TTL_SECONDS = 6 * 3600;

export interface AnalystTrend {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

/**
 * Yahoo's view of one asset for the watchlist stock page. Anything Yahoo doesn't have
 * (ETFs, crypto, small SET names) is null. Fields ending in `Pct` are already
 * percentages (6.71 = 6.71%); money is in `currency`.
 */
export interface AssetInsights {
  currency: string | null;
  price: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  eps: number | null;
  dividendYieldPct: number | null;
  beta: number | null;

  roePct: number | null;
  debtToEquityPct: number | null;
  profitMarginPct: number | null;
  revenueGrowthPct: number | null;
  freeCashflow: number | null;

  nextEarningsDate: string | null;
  exDividendDate: string | null;

  targetMeanPrice: number | null;
  recommendation: string | null;
  analystCount: number | null;
  analystTrend: AnalystTrend | null;

  sector: string | null;
  industry: string | null;
  website: string | null;
  businessSummary: string | null;

  fetchedAt: string;
}

const num = (value: number | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const pct = (fraction: number | undefined): number | null => {
  const value = num(fraction);
  return value == null ? null : value * 100;
};
const isoDate = (date: Date | undefined): string | null =>
  date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;

function toInsights(summary: YahooInsightsSummary, now: Date): AssetInsights {
  const { price, summaryDetail, defaultKeyStatistics, financialData, calendarEvents, recommendationTrend, assetProfile } =
    summary;
  // "0m" = the current month's tally.
  const trend = recommendationTrend?.trend?.find((t) => t.period === "0m");
  const upcomingEarnings = calendarEvents?.earnings?.earningsDate
    ?.filter((d) => d instanceof Date && d.getTime() >= now.getTime() - 24 * 3600 * 1000)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return {
    currency: price?.currency ?? null,
    price: num(price?.regularMarketPrice),
    marketCap: num(price?.marketCap),
    trailingPE: num(summaryDetail?.trailingPE),
    forwardPE: num(summaryDetail?.forwardPE),
    priceToBook: num(defaultKeyStatistics?.priceToBook),
    eps: num(defaultKeyStatistics?.trailingEps),
    dividendYieldPct: pct(summaryDetail?.dividendYield),
    beta: num(summaryDetail?.beta),

    roePct: pct(financialData?.returnOnEquity),
    debtToEquityPct: num(financialData?.debtToEquity),
    profitMarginPct: pct(financialData?.profitMargins),
    revenueGrowthPct: pct(financialData?.revenueGrowth),
    freeCashflow: num(financialData?.freeCashflow),

    nextEarningsDate: isoDate(upcomingEarnings),
    exDividendDate: isoDate(summaryDetail?.exDividendDate),

    targetMeanPrice: num(financialData?.targetMeanPrice),
    recommendation: financialData?.recommendationKey ?? null,
    analystCount: num(financialData?.numberOfAnalystOpinions),
    analystTrend: trend
      ? { strongBuy: trend.strongBuy, buy: trend.buy, hold: trend.hold, sell: trend.sell, strongSell: trend.strongSell }
      : null,

    sector: assetProfile?.sector || null,
    industry: assetProfile?.industry || null,
    website: assetProfile?.website || null,
    businessSummary: assetProfile?.longBusinessSummary || null,

    fetchedAt: now.toISOString(),
  };
}

export async function getAssetInsights(assetId: string): Promise<AssetInsights> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { symbol: true, exchange: true } });
  if (!asset) throw AppError.notFound("Asset not found");

  const symbol = yahooSymbolOf(asset);
  return getOrSetCache(`insights:${symbol}`, INSIGHTS_TTL_SECONDS, async () =>
    toInsights(await fetchYahooInsights(symbol), new Date()),
  );
}
