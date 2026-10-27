import { runDailySnapshotJob, scheduleDailySnapshotJob } from './daily-snapshot.job';
import { runMarketWatchJob, scheduleMarketWatchJob } from './market-watch.job';
import { runStorageUsageJob, scheduleStorageUsageJob } from './storage-usage.job';

export function scheduleJobs(): void {
  scheduleDailySnapshotJob();
  scheduleMarketWatchJob();
  scheduleStorageUsageJob();
  console.log('⏰ Cron jobs scheduled (daily snapshot, market watch, storage usage)');
}

/**
 * Every job once, back to back — for hosts that sleep when idle (the in-process cron
 * never fires there), triggered from outside via POST /jobs/run. Each job is
 * idempotent, so running them more often than their cron schedule is harmless.
 */
export async function runAllJobs(): Promise<void> {
  await runDailySnapshotJob();
  await runMarketWatchJob();
  await runStorageUsageJob();
}
