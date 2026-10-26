import { prisma } from "../../config/prisma";
import { redis } from "../../config/redis";
import { acquireOnceLock } from "../../common/utils/cache.util";
import { assertPortfolioOwnership } from "../../common/utils/portfolio-ownership.util";
import { DAY_MS, addDays, utcDay } from "../../common/utils/date.util";
import { backfillAssetPrices } from "../asset/asset.service";
import { backfillExchangeRates, getStoredRateRange, resolveHomeFxRate } from "../fx/fx.service";
import { createSnapshot } from "../snapshot/snapshot.service";
import { REPORTING_CURRENCY } from "../snapshot/snapshot.service";

/**
 * Keeps the historical data snapshots depend on — daily closes (AssetPrice) and daily
 * FX (ExchangeRate) — complete from each portfolio's first transaction until today,
 * and rebuilds snapshots whenever their inputs change.
 *
 * Everything here is "fill what's missing": the first run after deploy pulls the full
 * history from Yahoo once, later runs only fetch the last few days.
 */

// Bump when snapshot valuation logic changes — every portfolio gets a full rebuild once.
// v2 = valued as of the snapshot date (historical prices/FX) instead of "now".
const SNAPSHOT_VERSION = "2";

// Start fetching a week before the first transaction so day one has a prior close.
const LEAD_DAYS = 7;
// A stored series starting within this many days of the needed start counts as complete
// (the needed start can fall on a weekend/holiday with no bar).
const START_SLACK_DAYS = 5;

const keys = {
  priceFrom: (assetId: string) => `history:price-from:${assetId}`,
  priceTail: (assetId: string, day: string) => `history:price-tail:${assetId}:${day}`,
  fxFrom: (pair: string) => `history:fx-from:${pair}`,
  fxTail: (pair: string, day: string) => `history:fx-tail:${pair}:${day}`,
  snapshotVersion: (portfolioId: string) => `history:snapshot-version:${portfolioId}`,
  syncLock: "history:sync-lock",
  repairLock: (portfolioId: string) => `history:repair-lock:${portfolioId}`,
  repairPending: (portfolioId: string) => `history:repair-pending:${portfolioId}`,
};

function minDate(a: Date | undefined, b: Date): Date {
  return a && a.getTime() <= b.getTime() ? a : b;
}

/** Decides whether [neededFrom, today] is covered, given the stored range and what was already requested. */
async function needsStartBackfill(first: Date | null, neededFrom: Date, markerKey: string): Promise<boolean> {
  if (first && first.getTime() <= addDays(neededFrom, START_SLACK_DAYS).getTime()) return false;
  // Yahoo may simply have nothing that early (e.g. IPO later) — don't re-ask every run.
  const requestedFrom = await redis.get(markerKey);
  return !(requestedFrom && new Date(requestedFrom).getTime() <= neededFrom.getTime());
}

async function needsTailRefresh(last: Date | null, tailKey: string): Promise<boolean> {
  const yesterday = addDays(utcDay(new Date()), -1);
  if (last && last.getTime() >= yesterday.getTime()) return false;
  // At most one tail request per series per day (weekends have no new bars).
  return acquireOnceLock(tailKey, 2 * 24 * 3600);
}

async function ensurePriceCoverage(assetId: string, neededFrom: Date): Promise<void> {
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
  const where = { assetId, timeframe: "1D" };
  const [first, last] = await Promise.all([
    prisma.assetPrice.findFirst({ where, orderBy: { timestamp: "asc" } }),
    prisma.assetPrice.findFirst({ where, orderBy: { timestamp: "desc" } }),
  ]);

  if (await needsStartBackfill(first?.timestamp ?? null, neededFrom, keys.priceFrom(assetId))) {
    const count = await backfillAssetPrices(asset, neededFrom);
    await redis.set(keys.priceFrom(assetId), neededFrom.toISOString());
    console.log(`📈 Backfilled ${count} daily closes for ${asset.symbol} since ${neededFrom.toISOString().slice(0, 10)}`);
    return;
  }

  const today = utcDay(new Date()).toISOString().slice(0, 10);
  if (await needsTailRefresh(last?.timestamp ?? null, keys.priceTail(assetId, today))) {
    await backfillAssetPrices(asset, addDays(last?.timestamp ?? neededFrom, -1));
  }
}

async function ensureFxCoverage(from: string, to: string, neededFrom: Date): Promise<void> {
  const pair = `${from}${to}`;
  const { first, last } = await getStoredRateRange(from, to);

  if (await needsStartBackfill(first, neededFrom, keys.fxFrom(pair))) {
    const count = await backfillExchangeRates(from, to, neededFrom);
    await redis.set(keys.fxFrom(pair), neededFrom.toISOString());
    console.log(`💱 Backfilled ${count} daily ${from}/${to} rates since ${neededFrom.toISOString().slice(0, 10)}`);
    return;
  }

  const today = utcDay(new Date()).toISOString().slice(0, 10);
  if (await needsTailRefresh(last, keys.fxTail(pair, today))) {
    await backfillExchangeRates(from, to, addDays(last ?? neededFrom, -1));
  }
}

/**
 * Works out which assets and currency pairs the given portfolios need history for,
 * and from when, then fills the gaps. One Yahoo call per series that's missing data.
 */
export async function ensureHistoryCoverage(portfolioIds?: string[]): Promise<void> {
  const portfolios = await prisma.portfolio.findMany({
    where: { deletedAt: null, ...(portfolioIds ? { id: { in: portfolioIds } } : {}) },
    include: { cashAccounts: true },
  });

  const assetNeeds = new Map<string, Date>();
  const fxNeeds = new Map<string, Date>(); // "FROM:TO" → needed from

  for (const portfolio of portfolios) {
    const firstTx = await prisma.transaction.findFirst({
      where: { portfolioId: portfolio.id },
      orderBy: { executedAt: "asc" },
    });
    if (!firstTx) continue;
    const neededFrom = addDays(utcDay(firstTx.executedAt), -LEAD_DAYS);

    const traded = await prisma.transaction.findMany({
      where: { portfolioId: portfolio.id, mainAssetId: { not: null } },
      select: { mainAssetId: true },
      distinct: ["mainAssetId"],
    });
    const assets = await prisma.asset.findMany({
      where: { id: { in: traded.map((t) => t.mainAssetId!) } },
    });

    for (const asset of assets) {
      assetNeeds.set(asset.id, minDate(assetNeeds.get(asset.id), neededFrom));
    }

    const currencies = new Set([
      ...portfolio.cashAccounts.map((c) => c.currency),
      ...assets.map((a) => a.currency),
    ]);
    const addPair = (from: string, to: string) => {
      if (from === to) return;
      const key = `${from}:${to}`;
      fxNeeds.set(key, minDate(fxNeeds.get(key), neededFrom));
    };
    for (const currency of currencies) addPair(currency, portfolio.baseCurrency);
    addPair(portfolio.baseCurrency, REPORTING_CURRENCY); // net worth / combined dashboard
  }

  for (const [assetId, neededFrom] of assetNeeds) {
    try {
      await ensurePriceCoverage(assetId, neededFrom);
    } catch (err) {
      console.error(`❌ Price history backfill failed for asset ${assetId}:`, err instanceof Error ? err.message : err);
    }
  }

  for (const [pairKey, neededFrom] of fxNeeds) {
    const [from, to] = pairKey.split(":") as [string, string];
    try {
      await ensureFxCoverage(from, to, neededFrom);
    } catch (err) {
      console.error(`❌ FX history backfill failed for ${from}/${to}:`, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Recomputes DAILY snapshots for every day from `from` (default: first transaction)
 * through yesterday — and today too if today's snapshot already exists. Runs in date
 * order, since each day's TWR depends on the previous day's equity.
 */
export async function rebuildSnapshots(portfolioId: string, from?: Date): Promise<number> {
  const firstTx = await prisma.transaction.findFirst({
    where: { portfolioId },
    orderBy: { executedAt: "asc" },
  });
  if (!firstTx) return 0;

  const firstDay = utcDay(firstTx.executedAt);
  let day = from && utcDay(from).getTime() > firstDay.getTime() ? utcDay(from) : firstDay;

  const today = utcDay(new Date());
  const todayExists = await prisma.portfolioSnapshot.findUnique({
    where: { portfolioId_date_granularity: { portfolioId, date: today, granularity: "DAILY" } },
  });
  const lastDay = todayExists ? today : addDays(today, -1);

  let count = 0;
  for (; day.getTime() <= lastDay.getTime(); day = addDays(day, 1)) {
    await createSnapshot(portfolioId, day, "DAILY");
    count += 1;
  }
  return count;
}

/** Earliest day that needs a (re)build: everything after a logic change, otherwise the first missing day. */
async function findRebuildStart(portfolioId: string): Promise<Date | null> {
  const firstTx = await prisma.transaction.findFirst({
    where: { portfolioId },
    orderBy: { executedAt: "asc" },
  });
  if (!firstTx) return null;
  const firstDay = utcDay(firstTx.executedAt);

  if ((await redis.get(keys.snapshotVersion(portfolioId))) !== SNAPSHOT_VERSION) return firstDay;

  const yesterday = addDays(utcDay(new Date()), -1);
  const existing = await prisma.portfolioSnapshot.findMany({
    where: { portfolioId, granularity: "DAILY", date: { gte: firstDay, lte: yesterday } },
    select: { date: true },
  });
  const have = new Set(existing.map((s) => s.date.getTime()));
  for (let t = firstDay.getTime(); t <= yesterday.getTime(); t += DAY_MS) {
    if (!have.has(t)) return new Date(t);
  }
  return null;
}

/**
 * Open lots bought before purchase rates were recorded get their rate from the FX
 * history (filled just before this runs), so unrealized FX P/L works for them too.
 * Lots whose currency is the home currency resolve to 1.
 */
async function backfillLotPurchaseRates(): Promise<void> {
  const lots = await prisma.taxLot.findMany({
    where: { purchaseFxRate: null, remainingQty: { gt: 0 }, portfolio: { deletedAt: null } },
    include: { asset: true, portfolio: true },
  });

  let filled = 0;
  for (const lot of lots) {
    try {
      const rate = await resolveHomeFxRate(lot.portfolio, lot.asset.currency, lot.executedAt);
      if (rate == null) continue;
      await prisma.taxLot.update({ where: { id: lot.id }, data: { purchaseFxRate: rate } });
      filled += 1;
    } catch (err) {
      console.error(`❌ Could not fill purchase FX rate for lot ${lot.id}:`, err instanceof Error ? err.message : err);
    }
  }
  if (filled > 0) console.log(`💱 Filled purchase FX rates for ${filled} older tax lot(s)`);
}

/**
 * Startup + daily entry point: fill missing price/FX history, then (re)build any
 * missing or outdated snapshots. Guarded by a Redis lock so only one instance runs it.
 */
export async function syncHistory(): Promise<void> {
  if (!(await acquireOnceLock(keys.syncLock, 2 * 3600))) {
    console.log("⏭️  History sync already running elsewhere — skipped");
    return;
  }

  try {
    await ensureHistoryCoverage();
    await backfillLotPurchaseRates();

    const portfolios = await prisma.portfolio.findMany({ where: { deletedAt: null }, select: { id: true } });
    for (const { id } of portfolios) {
      try {
        const start = await findRebuildStart(id);
        if (start) {
          const count = await rebuildSnapshots(id, start);
          if (count > 0) console.log(`📸 Rebuilt ${count} snapshot(s) for portfolio ${id}`);
        }
        await redis.set(keys.snapshotVersion(id), SNAPSHOT_VERSION);
      } catch (err) {
        console.error(`❌ Snapshot rebuild failed for portfolio ${id}:`, err);
      }
    }
  } finally {
    await redis.del(keys.syncLock);
  }
}

/**
 * Called after a transaction dated in the past is recorded: every snapshot from that
 * day on is now stale. Runs in the background; concurrent requests for the same
 * portfolio are merged (the earliest date wins) instead of rebuilding twice.
 */
export function scheduleHistoryRepair(portfolioId: string, from: Date): void {
  runHistoryRepair(portfolioId, utcDay(from)).catch((err) =>
    console.error(`❌ History repair failed for portfolio ${portfolioId}:`, err),
  );
}

async function runHistoryRepair(portfolioId: string, from: Date): Promise<void> {
  const pendingKey = keys.repairPending(portfolioId);
  const pending = await redis.get(pendingKey);
  if (!pending || new Date(pending).getTime() > from.getTime()) {
    await redis.set(pendingKey, from.toISOString());
  }

  const lockKey = keys.repairLock(portfolioId);
  if (!(await acquireOnceLock(lockKey, 3600))) return; // the running repair picks up the pending date

  try {
    for (let next = await redis.get(pendingKey); next; next = await redis.get(pendingKey)) {
      await redis.del(pendingKey);
      await ensureHistoryCoverage([portfolioId]);
      await rebuildSnapshots(portfolioId, new Date(next));
    }
  } finally {
    await redis.del(lockKey);
  }

  // A request that arrived between the last check and releasing the lock.
  const late = await redis.get(pendingKey);
  if (late) await runHistoryRepair(portfolioId, new Date(late));
}

/** Only past-dated transactions invalidate existing snapshots. */
export async function repairIfBackdated(portfolioId: string, executedAt: Date): Promise<void> {
  const day = utcDay(executedAt);
  const affected = await prisma.portfolioSnapshot.findFirst({
    where: { portfolioId, granularity: "DAILY", date: { gte: day } },
    select: { id: true },
  });
  if (affected) scheduleHistoryRepair(portfolioId, day);
}

export async function requestSnapshotRebuild(userId: string, portfolioId: string, from?: Date): Promise<boolean> {
  await assertPortfolioOwnership(userId, portfolioId);
  scheduleHistoryRepair(portfolioId, from ?? new Date(0));
  return true;
}
