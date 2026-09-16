import yahooFinance from 'yahoo-finance2';
import PQueue from 'p-queue';

const queue = new PQueue({ concurrency: 2, intervalCap: 2, interval: 1000 }); // ~2 req/sec ceiling

async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const result = await queue.add(() => withRetry(fn));
  return result as T;
}

async function withRetry<T>(fn: () => Promise<T>, attempt = 1): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const isRateLimited = err instanceof Error && /429|Too Many Requests/i.test(err.message);
    if (isRateLimited && attempt <= 3) {
      const backoffMs = 1000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return withRetry(fn, attempt + 1);
    }
    throw err;
  }
}

export function fetchYahooQuote(symbol: string) {
  return withRateLimit(() => yahooFinance.quote(symbol));
}

export function fetchYahooHistorical(symbol: string, period1: Date, period2: Date) {
  return withRateLimit(() => yahooFinance.historical(symbol, { period1, period2, interval: '1d' }));
}

export function fetchYahooQuoteSummary(symbol: string) {
  return withRateLimit(() =>
    yahooFinance.quoteSummary(symbol, {
      modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData'],
    }),
  );
}
