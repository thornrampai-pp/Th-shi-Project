import cron from 'node-cron';
import { syncHistory } from '../modules/history/history.service';

export async function runDailySnapshotJob(): Promise<void> {
  console.log('⏰ Running daily history sync + snapshot job...');
  try {
    await syncHistory();
    console.log('✅ Daily history sync done');
  } catch (err) {
    console.error('❌ Daily history sync failed:', err);
  }
}

/**
 * 00:30 UTC daily (07:30 Bangkok) — after both SET (09:30 UTC) and US (21:00 UTC)
 * closes for the previous UTC day are available. syncHistory() pulls the newest daily
 * closes/FX and snapshots every day that's missing — normally just yesterday, more if
 * the server was down.
 */
export function scheduleDailySnapshotJob(): void {
  cron.schedule('30 0 * * *', runDailySnapshotJob, { timezone: 'UTC' });
}
