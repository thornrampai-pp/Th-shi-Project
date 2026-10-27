import cron from 'node-cron';
import { checkSlipStorageUsage } from '../modules/storage/storage.service';
import { formatBytes } from '../modules/storage/storage-usage';

export async function runStorageUsageJob(): Promise<void> {
  try {
    const result = await checkSlipStorageUsage();
    console.log(
      `💾 R2 slip storage: ${formatBytes(result.usage.usedBytes)} / ${formatBytes(result.usage.quotaBytes)} ` +
        `(${result.usage.percent.toFixed(1)}%)${result.notified ? ' — admins notified' : result.reason ? ` — ${result.reason}` : ''}`,
    );
  } catch (err) {
    console.error('❌ Storage usage check failed:', err);
  }
}

/** 01:00 UTC daily — sums slip sizes from the DB and alerts admins near the R2 quota. */
export function scheduleStorageUsageJob(): void {
  cron.schedule('0 1 * * *', runStorageUsageJob, { timezone: 'UTC' });
}
