import { prisma } from '../../config/prisma';
import { AppError } from '../../common/errors/AppError';
import { getOrSetCache, acquireOnceLock, CACHE_TTL } from '../../common/utils/cache.util';
import {
  fetchYahooQuote,
  fetchYahooHistorical,
  fetchYahooQuoteSummary,
} from '../../common/integrations/yahoo-finance.util';

// String literal unions instead of importing AssetType/DataPeriod from Prisma — keeps this
// file decoupled from the generated client's exact path/shape (see config/prisma.ts note).
export type AssetTypeValue = 'ST`O`CK' | 'ETF' | 'CRYPTO' | 'FOREX' | 'GOLD';

export async function getAssetById(id: string) {
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) throw AppError.notFound('Asset not found');
  return asset;
}

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
          { symbol: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    take: Math.min(limit, 100),
    skip: offset,
    orderBy: { symbol: 'asc' },
  });
}

export async function getAssetQuote(symbol: string) {
  return getOrSetCache(`quote:${symbol}`, CACHE_TTL.QUOTE, async () => {
    const quote = await fetchYahooQuote(symbol);
    return {
      symbol,
      price: quote.regularMarketPrice ?? null,
      change: quote.regularMarketChange ?? null,
      changePercent: quote.regularMarketChangePercent ?? null,
      marketState: quote.marketState ?? null,
      asOf: new Date().toISOString(),
    };
  });
}

export async function syncAssetFromYahoo(symbol: string, exchange = 'GLOBAL') {
  const quote = await fetchYahooQuote(symbol);

  if (!quote?.regularMarketPrice) {
    throw AppError.notFound(`Yahoo Finance has no data for symbol "${symbol}"`);
  }

  return prisma.asset.upsert({
    where: { symbol_exchange: { symbol, exchange } },
    update: { name: quote.longName ?? quote.shortName ?? symbol, currency: quote.currency ?? 'USD' },
    create: {
      symbol,
      exchange,
      name: quote.longName ?? quote.shortName ?? symbol,
      currency: quote.currency ?? 'USD',
      type: guessAssetType(quote.quoteType),
    },
  });
}

/**
 * DB-first, Yahoo-fallback lookup for a single exact symbol. Already tracked symbols
 * (e.g. previously-synced NASDAQ tickers) are a plain DB read; anything not tracked yet
 * gets fetched from Yahoo once and persisted, so the next search is a DB hit.
 */
export async function findOrFetchAssetBySymbol(symbol: string, exchange = 'GLOBAL') {
  const normalizedSymbol = symbol.trim().toUpperCase();

  const existing = await prisma.asset.findUnique({
    where: { symbol_exchange: { symbol: normalizedSymbol, exchange } },
  });
  if (existing) {
    return existing;
  }

  return syncAssetFromYahoo(normalizedSymbol, exchange);
}

function guessAssetType(quoteType?: string): AssetTypeValue {
  switch (quoteType) {
    case 'ETF':
      return 'ETF';
    case 'CRYPTOCURRENCY':
      return 'CRYPTO';
    case 'CURRENCY':
      return 'FOREX';
    default:
      return 'STOCK';
  }
}

export async function refreshAssetPriceHistory(assetId: string, days = 30): Promise<number> {
  const asset = await getAssetById(assetId);

  const acquired = await acquireOnceLock(`price-sync-lock:${assetId}`, CACHE_TTL.EOD_SYNC_LOCK);
  if (!acquired) {
    return 0;
  }

  const period2 = new Date();
  const period1 = new Date();
  period1.setDate(period1.getDate() - days);

  const bars = await fetchYahooHistorical(asset.symbol, period1, period2);
  if (bars.length === 0) return 0;

  await prisma.$transaction(
    bars.map((bar) =>
      prisma.assetPrice.upsert({
        where: { assetId_timestamp_timeframe: { assetId, timestamp: bar.date, timeframe: '1D' } },
        update: {
          closePrice: bar.close,
          openPrice: bar.open,
          highPrice: bar.high,
          lowPrice: bar.low,
          volume: bar.volume != null ? BigInt(Math.round(bar.volume)) : null,
        },
        create: {
          assetId,
          timestamp: bar.date,
          timeframe: '1D',
          closePrice: bar.close,
          openPrice: bar.open,
          highPrice: bar.high,
          lowPrice: bar.low,
          volume: bar.volume != null ? BigInt(Math.round(bar.volume)) : null,
        },
      }),
    ),
  );

  return bars.length;
}

export async function getAssetPriceHistory(assetId: string, from: Date, to: Date) {
  return prisma.assetPrice.findMany({
    where: { assetId, timeframe: '1D', timestamp: { gte: from, lte: to } },
    orderBy: { timestamp: 'asc' },
  });
}

export async function getAssetFundamentals(assetId: string) {
  return prisma.assetFundamental.findMany({
    where: { assetId },
    orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
  });
}

export async function syncAssetFundamentals(assetId: string) {
  const asset = await getAssetById(assetId);

  const acquired = await acquireOnceLock(`fundamental-sync-lock:${assetId}`, CACHE_TTL.FUNDAMENTAL);
  if (!acquired) {
    const existing = await prisma.assetFundamental.findFirst({ where: { assetId, isLatest: true } });
    if (existing) return existing;
  }

  const summary = await fetchYahooQuoteSummary(asset.symbol);
  const year = new Date().getFullYear();
  const mapped = mapYahooFundamentals(summary);

  await prisma.assetFundamental.updateMany({ where: { assetId, isLatest: true }, data: { isLatest: false } });

  return prisma.assetFundamental.upsert({
    where: { assetId_period_year_quarter: { assetId, period: 'ANNUAL', year, quarter: 0 } },
    update: mapped,
    create: { assetId, period: 'ANNUAL', year, quarter: 0, ...mapped },
  });
}

function mapYahooFundamentals(summary: Awaited<ReturnType<typeof fetchYahooQuoteSummary>>) {
  const { summaryDetail, defaultKeyStatistics, financialData } = summary;
  return {
    isLatest: true,
    peRatio: summaryDetail?.trailingPE ?? null,
    pbvRatio: defaultKeyStatistics?.priceToBook ?? null,
    dividendYield: summaryDetail?.dividendYield != null ? summaryDetail.dividendYield * 100 : null,
    roe: financialData?.returnOnEquity != null ? financialData.returnOnEquity * 100 : null,
    roa: financialData?.returnOnAssets != null ? financialData.returnOnAssets * 100 : null,
    debtToEquity: financialData?.debtToEquity ?? null,
    currentRatio: financialData?.currentRatio ?? null,
    revenue: financialData?.totalRevenue ?? null,
    freeCashFlow: financialData?.freeCashflow ?? null,
    revenueGrowth: financialData?.revenueGrowth != null ? financialData.revenueGrowth * 100 : null,
  };
}

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
          roe: filters.roeMin != null ? { gte: filters.roeMin } : undefined,
          debtToEquity: filters.debtToEquityMax != null ? { lte: filters.debtToEquityMax } : undefined,
          dividendYield: filters.dividendYieldMin != null ? { gte: filters.dividendYieldMin } : undefined,
        },
      },
    },
  });
}

function buildRange(min?: number, max?: number) {
  if (min == null && max == null) return undefined;
  return { ...(min != null && { gte: min }), ...(max != null && { lte: max }) };
}
