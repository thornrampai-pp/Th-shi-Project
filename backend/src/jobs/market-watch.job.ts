import cron from 'node-cron';
import { checkActiveAlerts } from '../modules/alert/alert.service';
import { processPendingPaperOrders } from '../modules/trading/order.service';
import { acquireOnceLock } from '../common/utils/cache.util';
import { redis } from '../config/redis';

const LOCK_KEY = 'market-watch-job-lock';
// Under the 5-minute schedule, so a run that crashes without reaching the `finally`
// still unlocks before the next tick instead of staying stuck.
const LOCK_TTL_SECONDS = 4 * 60;

/**
 * A run that overlaps the previous one is skipped rather than stacked. Redis-backed (not
 * an in-process flag) so this still holds if this job ever runs on more than one instance.
 */
export async function runMarketWatchJob(): Promise<void> {
  if (!(await acquireOnceLock(LOCK_KEY, LOCK_TTL_SECONDS))) return;
  try {
    const triggered = await checkActiveAlerts();
    const filled = await processPendingPaperOrders();
    if (triggered || filled) {
      console.log(`🔔 Market watch: ${triggered} alert(s) triggered, ${filled} paper order(s) filled`);
    }
  } catch (err) {
    console.error('❌ Market watch job failed:', err);
  } finally {
    await redis.del(LOCK_KEY);
  }
}

/**
 * Every 5 minutes: evaluate price/fundamental alerts and try to fill open PAPER limit
 * orders. Quotes are Redis-cached for 3 minutes and Yahoo calls go through the shared
 * rate-limited queue, so this stays well within Yahoo's limits.
 */
export function scheduleMarketWatchJob(): void {
  cron.schedule('*/5 * * * *', runMarketWatchJob);
}
