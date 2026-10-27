import cron from 'node-cron';
import { checkActiveAlerts } from '../modules/alert/alert.service';
import { processPendingPaperOrders } from '../modules/trading/order.service';

let running = false;

/** A run that overlaps the previous one is skipped rather than stacked. */
export async function runMarketWatchJob(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const triggered = await checkActiveAlerts();
    const filled = await processPendingPaperOrders();
    if (triggered || filled) {
      console.log(`🔔 Market watch: ${triggered} alert(s) triggered, ${filled} paper order(s) filled`);
    }
  } catch (err) {
    console.error('❌ Market watch job failed:', err);
  } finally {
    running = false;
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
