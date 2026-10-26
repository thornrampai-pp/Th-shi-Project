import { scheduleDailySnapshotJob } from './daily-snapshot.job';
import { scheduleMarketWatchJob } from './market-watch.job';
import { scheduleStorageUsageJob } from './storage-usage.job';

export function scheduleJobs(): void {
  scheduleDailySnapshotJob();
  scheduleMarketWatchJob();
  scheduleStorageUsageJob();
  console.log('⏰ Cron jobs scheduled (daily snapshot, market watch, storage usage)');
}
