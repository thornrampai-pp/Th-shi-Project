import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/AppError";
import { getOrSetCache } from "../../common/utils/cache.util";
import {
  fetchYahooHistorical,
  fetchYahooQuote,
} from "../../common/integrations/yahoo-finance.util";
import { addDays, utcDay } from "../../common/utils/date.util";

/**
 * The user's home currency: tax is filed in it, cross-portfolio totals are reported in
 * it, and FX gain/loss is measured against it.
 */
export const HOME_CURRENCY = "THB";

const FX_LIVE_TTL_SECONDS = 60 * 60; // 1h — good enough for valuation/net worth
// How far back a stored rate may be used for a given day (weekends, holidays).
const FX_LOOKBACK_DAYS = 7;

const toUtcMidnight = utcDay;

/**
 * Yahoo stamps FX daily bars at 00:00 London time (23:00 UTC the previous day during
 * BST). Shifting by 12h before truncating maps both cases to the intended day.
 */
export function fxBarDay(barDate: Date): Date {
  return utcDay(new Date(barDate.getTime() + 12 * 60 * 60 * 1000));
}

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

async function saveRate(from: string, to: string, date: Date, rate: number) {
  await prisma.exchangeRate.upsert({
    where: { fromCurrency_toCurrency_date: { fromCurrency: from, toCurrency: to, date } },
    update: { rate },
    create: { fromCurrency: from, toCurrency: to, date, rate },
  });
}

/** Most recent stored rate on or before `date` — the fallback when Yahoo is unreachable. */
async function findStoredRate(from: string, to: string, date: Date): Promise<number | null> {
  const stored = await prisma.exchangeRate.findFirst({
    where: { fromCurrency: from, toCurrency: to, date: { lte: date } },
    orderBy: { date: "desc" },
  });
  return stored ? Number(stored.rate) : null;
}

async function fetchLiveRate(from: string, to: string): Promise<number> {
  return getOrSetCache(`fx:${from}${to}`, FX_LIVE_TTL_SECONDS, async () => {
    const quote = await fetchYahooQuote(`${from}${to}=X`);
    if (!quote.regularMarketPrice) {
      throw AppError.notFound(`Yahoo Finance has no FX quote for ${from}/${to}`);
    }
    await saveRate(from, to, toUtcMidnight(new Date()), quote.regularMarketPrice);
    return quote.regularMarketPrice;
  });
}

async function fetchHistoricalRate(from: string, to: string, date: Date): Promise<number> {
  // Backfilled history covers almost every lookup — weekends/holidays resolve to the
  // last trading day's close without touching Yahoo.
  const stored = await prisma.exchangeRate.findFirst({
    where: {
      fromCurrency: from,
      toCurrency: to,
      date: { lte: date, gte: addDays(date, -FX_LOOKBACK_DAYS) },
    },
    orderBy: { date: "desc" },
  });
  if (stored) return Number(stored.rate);

  const bars = await fetchYahooHistorical(
    `${from}${to}=X`,
    addDays(date, -FX_LOOKBACK_DAYS),
    addDays(date, 1),
  );
  const bar = bars.filter((b) => fxBarDay(b.date).getTime() <= date.getTime()).at(-1);
  if (!bar) {
    throw AppError.notFound(`No ${from}/${to} rate available around ${date.toISOString().slice(0, 10)}`);
  }

  await saveRate(from, to, fxBarDay(bar.date), bar.close);
  return bar.close;
}

/**
 * Bulk-loads daily closes for a pair into ExchangeRate (existing days are kept).
 * Used by the history backfill — one Yahoo call per pair regardless of range length.
 */
export async function backfillExchangeRates(
  fromCurrency: string,
  toCurrency: string,
  start: Date,
  end: Date = new Date(),
): Promise<number> {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (from === to) return 0;

  const bars = await fetchYahooHistorical(`${from}${to}=X`, start, addDays(end, 1));
  if (bars.length === 0) return 0;

  const { count } = await prisma.exchangeRate.createMany({
    data: bars.map((bar) => ({ fromCurrency: from, toCurrency: to, date: fxBarDay(bar.date), rate: bar.close })),
    skipDuplicates: true,
  });
  return count;
}

export async function getStoredRateRange(fromCurrency: string, toCurrency: string) {
  const where = { fromCurrency: normalizeCurrency(fromCurrency), toCurrency: normalizeCurrency(toCurrency) };
  const [first, last] = await Promise.all([
    prisma.exchangeRate.findFirst({ where, orderBy: { date: "asc" } }),
    prisma.exchangeRate.findFirst({ where, orderBy: { date: "desc" } }),
  ]);
  return { first: first?.date ?? null, last: last?.date ?? null };
}

/**
 * Rate to convert 1 unit of `from` into `to`. Without `date` (or for today) uses the
 * live Yahoo quote cached in Redis; for past dates uses the daily close. Every rate
 * fetched is also persisted to ExchangeRate, which doubles as the offline fallback.
 */
export async function getExchangeRate(fromCurrency: string, toCurrency: string, date?: Date): Promise<number> {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (from === to) return 1;

  const day = toUtcMidnight(date ?? new Date());
  const isToday = day.getTime() === toUtcMidnight(new Date()).getTime();

  try {
    return isToday ? await fetchLiveRate(from, to) : await fetchHistoricalRate(from, to, day);
  } catch (err) {
    const fallback = await findStoredRate(from, to, day);
    if (fallback != null) return fallback;

    throw AppError.badRequest(
      `Could not get the ${from}/${to} exchange rate: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }
}

export async function convertAmount(amount: number, fromCurrency: string, toCurrency: string, date?: Date) {
  return amount * (await getExchangeRate(fromCurrency, toCurrency, date));
}

/**
 * Memoizes rates for the lifetime of one operation (e.g. a single valuation pass), so
 * a portfolio with 30 USD positions triggers one lookup, not 30.
 */
export function createRateResolver(date?: Date) {
  const memo = new Map<string, Promise<number>>();
  return (from: string, to: string): Promise<number> => {
    const key = `${normalizeCurrency(from)}:${normalizeCurrency(to)}`;
    let rate = memo.get(key);
    if (!rate) {
      rate = getExchangeRate(from, to, date);
      memo.set(key, rate);
    }
    return rate;
  };
}

export async function listExchangeRates(fromCurrency: string, toCurrency: string, from: Date, to: Date) {
  return prisma.exchangeRate.findMany({
    where: {
      fromCurrency: normalizeCurrency(fromCurrency),
      toCurrency: normalizeCurrency(toCurrency),
      date: { gte: toUtcMidnight(from), lte: to },
    },
    orderBy: { date: "asc" },
  });
}

/**
 * Rate to the home currency for P/L splitting. REAL portfolios must have it (throws if
 * no rate can be found); PAPER portfolios degrade to null so a Yahoo outage never
 * blocks simulated trading — the FX split is then just skipped for that trade.
 */
export async function resolveHomeFxRate(
  portfolio: { type: string },
  currency: string,
  date: Date,
): Promise<number | null> {
  if (normalizeCurrency(currency) === HOME_CURRENCY) return 1;
  if (portfolio.type === "REAL") return getExchangeRate(currency, HOME_CURRENCY, date);
  try {
    return await getExchangeRate(currency, HOME_CURRENCY, date);
  } catch (err) {
    console.warn(`⚠️ No ${currency}/${HOME_CURRENCY} rate for paper trade — FX split skipped:`, err instanceof Error ? err.message : err);
    return null;
  }
}
