import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/AppError";
import {
  getOrSetCache,
  acquireOnceLock,
  CACHE_TTL,
} from "../../common/utils/cache.util";

import {
  fetchYahooQuote,
  fetchYahooHistorical,
  fetchYahooQuoteSummary,
  yahooSymbolOf,
  type YahooQuoteSummary,
} from "../../common/integrations/yahoo-finance.util";

/**
 * ---------------------------------------------------------
 * Types
 * ---------------------------------------------------------
 */

export type AssetTypeValue = "STOCK" | "ETF" | "CRYPTO" | "FOREX" | "GOLD";

/**
 * ---------------------------------------------------------
 * Get Asset
 * ---------------------------------------------------------
 */

export async function getAssetById(id: string) {
  const asset = await prisma.asset.findUnique({
    where: { id },
  });

  if (!asset) {
    throw AppError.notFound("Asset not found");
  }

  return asset;
}

/**
 * ---------------------------------------------------------
 * List Assets
 * ---------------------------------------------------------
 */

export async function listAssets(params: {
  search?: string;
  type?: AssetTypeValue;
  exchange?: string;
  limit?: number;
  offset?: number;
}) {
  const { search, type, exchange, limit = 20, offset = 0 } = params;

  return prisma.asset.findMany({
    where: {
      type,
      exchange,

      ...(search && {
        OR: [
          {
            symbol: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      }),
    },

    take: Math.min(limit, 100),
    skip: offset,

    orderBy: {
      symbol: "asc",
    },
  });
}

/**
 * ---------------------------------------------------------
 * Get Quote
 * ---------------------------------------------------------
 */

export async function getAssetQuote(symbol: string) {
  const normalizedSymbol = symbol.trim().toUpperCase();

  return getOrSetCache(
    `quote:${normalizedSymbol}`,
    CACHE_TTL.QUOTE,
    async () => {
      const quote = await fetchYahooQuote(normalizedSymbol);

      return {
        symbol: normalizedSymbol,

        price: quote.regularMarketPrice ?? null,

        change: quote.regularMarketChange ?? null,

        changePercent: quote.regularMarketChangePercent ?? null,

        marketState: quote.marketState ?? null,

        asOf: new Date().toISOString(),
      };
    },
  );
}

/**
 * ---------------------------------------------------------
 * Sync Asset From Yahoo
 * ---------------------------------------------------------
 */

export async function syncAssetFromYahoo(symbol: string, exchange = "GLOBAL") {
  const normalizedSymbol = symbol.trim().toUpperCase();

  const quote = await fetchYahooQuote(normalizedSymbol);

  if (!quote?.regularMarketPrice) {
    throw AppError.notFound(
      `Yahoo Finance has no data for symbol "${normalizedSymbol}"`,
    );
  }

  return prisma.asset.upsert({
    where: {
      symbol_exchange: {
        symbol: normalizedSymbol,
        exchange,
      },
    },

    update: {
      name: quote.longName ?? quote.shortName ?? normalizedSymbol,

      currency: quote.currency ?? "USD",
    },

    create: {
      symbol: normalizedSymbol,

      exchange,

      name: quote.longName ?? quote.shortName ?? normalizedSymbol,

      currency: quote.currency ?? "USD",

      type: guessAssetType(quote.quoteType),
    },
  });
}

/**
 * ---------------------------------------------------------
 * Find Existing Asset
 * or Fetch From Yahoo
 * ---------------------------------------------------------
 */

export async function findOrFetchAssetBySymbol(
  symbol: string,
  exchange = "GLOBAL",
) {
  const normalizedSymbol = symbol.trim().toUpperCase();

  const existing = await prisma.asset.findUnique({
    where: {
      symbol_exchange: {
        symbol: normalizedSymbol,
        exchange,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return syncAssetFromYahoo(normalizedSymbol, exchange);
}

/**
 * ---------------------------------------------------------
 * Guess Asset Type
 * ---------------------------------------------------------
 */

function guessAssetType(quoteType?: string): AssetTypeValue {
  switch (quoteType) {
    case "ETF":
      return "ETF";

    case "CRYPTOCURRENCY":
      return "CRYPTO";

    case "CURRENCY":
      return "FOREX";

    default:
      return "STOCK";
  }
}

/**
 * ---------------------------------------------------------
 * Refresh Asset Price History
 * ---------------------------------------------------------
 */

export async function refreshAssetPriceHistory(
  assetId: string,
  days = 30,
): Promise<number> {
  const asset = await getAssetById(assetId);

  const acquired = await acquireOnceLock(
    `price-sync-lock:${assetId}`,
    CACHE_TTL.EOD_SYNC_LOCK,
  );

  if (!acquired) {
    return 0;
  }

  const period2 = new Date();

  const period1 = new Date();
  period1.setDate(period1.getDate() - days);

  const bars = await fetchYahooHistorical(yahooSymbolOf(asset), period1, period2);

  if (bars.length === 0) {
    return 0;
  }

  await prisma.$transaction(
    bars.map((bar) =>
      prisma.assetPrice.upsert({
        where: {
          assetId_timestamp_timeframe: {
            assetId,
            timestamp: bar.date,
            timeframe: "1D",
          },
        },

        update: {
          closePrice: bar.close,

          openPrice: bar.open ?? null,

          highPrice: bar.high ?? null,

          lowPrice: bar.low ?? null,

          volume: bar.volume != null ? BigInt(Math.round(bar.volume)) : null,
        },

        create: {
          assetId,

          timestamp: bar.date,

          timeframe: "1D",

          closePrice: bar.close,

          openPrice: bar.open ?? null,

          highPrice: bar.high ?? null,

          lowPrice: bar.low ?? null,

          volume: bar.volume != null ? BigInt(Math.round(bar.volume)) : null,
        },
      }),
    ),
  );

  return bars.length;
}

/**
 * ---------------------------------------------------------
 * Get Price History
 * ---------------------------------------------------------
 */

export async function getAssetPriceHistory(
  assetId: string,
  from: Date,
  to: Date,
) {
  return prisma.assetPrice.findMany({
    where: {
      assetId,

      timeframe: "1D",

      timestamp: {
        gte: from,
        lte: to,
      },
    },

    orderBy: {
      timestamp: "asc",
    },
  });
}

/**
 * ---------------------------------------------------------
 * Get Fundamentals
 * ---------------------------------------------------------
 */

export async function getAssetFundamentals(assetId: string) {
  return prisma.assetFundamental.findMany({
    where: {
      assetId,
    },

    orderBy: [
      {
        year: "desc",
      },
      {
        quarter: "desc",
      },
    ],
  });
}

/**
 * ---------------------------------------------------------
 * Sync Fundamentals
 * ---------------------------------------------------------
 */

export async function syncAssetFundamentals(assetId: string) {
  const asset = await getAssetById(assetId);

  const acquired = await acquireOnceLock(
    `fundamental-sync-lock:${assetId}`,
    CACHE_TTL.FUNDAMENTAL,
  );

  if (!acquired) {
    const existing = await prisma.assetFundamental.findFirst({
      where: {
        assetId,
        isLatest: true,
      },
    });

    if (existing) {
      return existing;
    }
  }

  const summary = await fetchYahooQuoteSummary(yahooSymbolOf(asset));

  const year = new Date().getFullYear();

  const mapped = mapYahooFundamentals(summary);

  await prisma.assetFundamental.updateMany({
    where: {
      assetId,
      isLatest: true,
    },

    data: {
      isLatest: false,
    },
  });

  return prisma.assetFundamental.upsert({
    where: {
      assetId_period_year_quarter: {
        assetId,
        period: "ANNUAL",
        year,
        quarter: 0,
      },
    },

    update: mapped,

    create: {
      assetId,
      period: "ANNUAL",
      year,
      quarter: 0,
      ...mapped,
    },
  });
}

/**
 * ---------------------------------------------------------
 * Map Yahoo Fundamentals
 * ---------------------------------------------------------
 */

function mapYahooFundamentals(summary: YahooQuoteSummary) {
  const { summaryDetail, defaultKeyStatistics, financialData } = summary;

  return {
    isLatest: true,

    peRatio: summaryDetail?.trailingPE ?? null,

    pbvRatio: defaultKeyStatistics?.priceToBook ?? null,

    dividendYield:
      summaryDetail?.dividendYield != null
        ? summaryDetail.dividendYield * 100
        : null,

    roe:
      financialData?.returnOnEquity != null
        ? financialData.returnOnEquity * 100
        : null,

    roa:
      financialData?.returnOnAssets != null
        ? financialData.returnOnAssets * 100
        : null,

    debtToEquity: financialData?.debtToEquity ?? null,

    currentRatio: financialData?.currentRatio ?? null,

    revenue: financialData?.totalRevenue ?? null,

    freeCashFlow: financialData?.freeCashflow ?? null,

    revenueGrowth:
      financialData?.revenueGrowth != null
        ? financialData.revenueGrowth * 100
        : null,
  };
}

/**
 * ---------------------------------------------------------
 * Stock Screener
 * ---------------------------------------------------------
 */

export async function screenStocks(filters: {
  peMin?: number;
  peMax?: number;
  roeMin?: number;
  debtToEquityMax?: number;
  dividendYieldMin?: number;
  sector?: string;
  exchange?: string;
}) {
  return prisma.asset.findMany({
    where: {
      exchange: filters.exchange,

      sector: filters.sector,

      fundamentals: {
        some: {
          isLatest: true,

          peRatio: buildRange(filters.peMin, filters.peMax),

          roe:
            filters.roeMin != null
              ? {
                  gte: filters.roeMin,
                }
              : undefined,

          debtToEquity:
            filters.debtToEquityMax != null
              ? {
                  lte: filters.debtToEquityMax,
                }
              : undefined,

          dividendYield:
            filters.dividendYieldMin != null
              ? {
                  gte: filters.dividendYieldMin,
                }
              : undefined,
        },
      },
    },
  });
}

/**
 * ---------------------------------------------------------
 * Build Prisma Numeric Range
 * ---------------------------------------------------------
 */

function buildRange(min?: number, max?: number) {
  if (min == null && max == null) {
    return undefined;
  }

  return {
    ...(min != null && {
      gte: min,
    }),

    ...(max != null && {
      lte: max,
    }),
  };
}

/**
 * ---------------------------------------------------------
 * Latest Price (for valuation / orders / alerts)
 * ---------------------------------------------------------
 */

/**
 * Live quote first (Redis-cached 3 min), falling back to the latest stored daily
 * close when Yahoo is unreachable. Returns null only if neither exists.
 */
export async function getLatestPrice(asset: {
  id: string;
  symbol: string;
  exchange: string;
}): Promise<number | null> {
  try {
    const quote = await getAssetQuote(yahooSymbolOf(asset));
    if (quote.price != null) return quote.price;
  } catch (err) {
    console.warn(
      `⚠️ Live quote failed for ${asset.symbol}, using last close:`,
      err instanceof Error ? err.message : err,
    );
  }

  const latest = await prisma.assetPrice.findFirst({
    where: { assetId: asset.id, timeframe: "1D" },
    orderBy: { timestamp: "desc" },
  });

  return latest ? Number(latest.closePrice) : null;
}

/**
 * ---------------------------------------------------------
 * Backfill Price History (bulk)
 * ---------------------------------------------------------
 */

/**
 * Loads daily closes for [start, end] in one Yahoo call and inserts the days not yet
 * stored. Unlike refreshAssetPriceHistory() there's no once-a-day lock — callers
 * (history.service) decide when a range is actually missing.
 */
export async function backfillAssetPrices(
  asset: { id: string; symbol: string; exchange: string },
  start: Date,
  end: Date = new Date(),
): Promise<number> {
  const bars = await fetchYahooHistorical(yahooSymbolOf(asset), start, end);
  if (bars.length === 0) return 0;

  const { count } = await prisma.assetPrice.createMany({
    data: bars.map((bar) => ({
      assetId: asset.id,
      timestamp: bar.date,
      timeframe: "1D",
      closePrice: bar.close,
      openPrice: bar.open ?? null,
      highPrice: bar.high ?? null,
      lowPrice: bar.low ?? null,
      volume: bar.volume != null ? BigInt(Math.round(bar.volume)) : null,
    })),
    skipDuplicates: true,
  });

  return count;
}
