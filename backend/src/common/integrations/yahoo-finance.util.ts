import YahooFinance from "yahoo-finance2";
import PQueue from "p-queue";

// yahoo-finance2 v3+ exports a class — calling methods on the default export directly
// throws "Call `const yahooFinance = new YahooFinance()` first".
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const queue = new PQueue({
  concurrency: 2,
  intervalCap: 2,
  interval: 1000,
});

async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const result = await queue.add(() => withRetry(fn));
  return result as T;
}

async function withRetry<T>(fn: () => Promise<T>, attempt = 1): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const isRateLimited =
      err instanceof Error && /429|Too Many Requests/i.test(err.message);

    if (isRateLimited && attempt <= 3) {
      const backoffMs = 1000 * 2 ** attempt;

      await new Promise((resolve) => setTimeout(resolve, backoffMs));

      return withRetry(fn, attempt + 1);
    }

    throw err;
  }
}

/**
 * ---------------------------------------------------------
 * Yahoo Quote
 * ---------------------------------------------------------
 */

export interface YahooQuote {
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  marketState?: string;

  longName?: string;
  shortName?: string;
  currency?: string;
  quoteType?: string;
}

export function fetchYahooQuote(symbol: string): Promise<YahooQuote> {
  return withRateLimit(async () => {
    const result = await yahooFinance.quote(symbol);

    return result as YahooQuote;
  });
}

/**
 * ---------------------------------------------------------
 * Yahoo Historical
 * ---------------------------------------------------------
 */

export interface YahooHistoricalBar {
  date: Date;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export function fetchYahooHistorical(
  symbol: string,
  period1: Date,
  period2: Date,
): Promise<YahooHistoricalBar[]> {
  // chart() replaces historical(), whose underlying Yahoo endpoint was removed.
  return withRateLimit(async () => {
    const result = await yahooFinance.chart(symbol, {
      period1,
      period2,
      interval: "1d",
    });

    // Bars for still-open or missing sessions come back with a null close — skip them.
    return result.quotes
      .filter((q) => q.close != null)
      .map((q) => ({
        date: q.date,
        close: q.close as number,
        open: q.open ?? undefined,
        high: q.high ?? undefined,
        low: q.low ?? undefined,
        volume: q.volume ?? undefined,
      }));
  });
}

/**
 * ---------------------------------------------------------
 * Yahoo Fundamentals
 * ---------------------------------------------------------
 */

export interface YahooQuoteSummary {
  summaryDetail?: {
    trailingPE?: number;
    dividendYield?: number;
  };

  defaultKeyStatistics?: {
    priceToBook?: number;
  };

  financialData?: {
    returnOnEquity?: number;
    returnOnAssets?: number;
    debtToEquity?: number;
    currentRatio?: number;
    totalRevenue?: number;
    freeCashflow?: number;
    revenueGrowth?: number;
  };
}

export function fetchYahooQuoteSummary(
  symbol: string,
): Promise<YahooQuoteSummary> {
  return withRateLimit(async () => {
    const result = await yahooFinance.quoteSummary(symbol, {
      modules: ["summaryDetail", "defaultKeyStatistics", "financialData"],
    });

    return result as YahooQuoteSummary;
  });
}

/**
 * ---------------------------------------------------------
 * Symbol mapping
 * ---------------------------------------------------------
 */

const YAHOO_EXCHANGE_SUFFIX: Record<string, string> = {
  SET: ".BK",
  MAI: ".BK",
  HKEX: ".HK",
  TSE: ".T",
  LSE: ".L",
};

/**
 * Our Asset rows store the plain ticker + exchange (PTT / SET), Yahoo wants the
 * suffixed form (PTT.BK). Symbols that already carry a suffix or a Yahoo-specific
 * form (BTC-USD, USDTHB=X) are passed through untouched.
 */
export function yahooSymbolOf(asset: { symbol: string; exchange: string }): string {
  const symbol = asset.symbol.trim().toUpperCase();
  if (/[.=^-]/.test(symbol)) return symbol;
  return symbol + (YAHOO_EXCHANGE_SUFFIX[asset.exchange.toUpperCase()] ?? "");
}
