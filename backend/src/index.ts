import { createApp } from './app';
import { env } from './config/env';
import { scheduleJobs } from './jobs';
import { syncHistory } from './modules/history/history.service';

createApp()
  .then((app) => {
    app.listen(env.PORT, () => {
      console.log(`🚀 Server ready at http://localhost:${env.PORT}/graphql`);
    });

    if (env.ENABLE_JOBS) {
      scheduleJobs();

      // One-time (then incremental) Yahoo backfill of daily closes + FX, followed by
      // rebuilding snapshots — in the background so the API is available immediately.
      if (env.ENABLE_HISTORY_BOOTSTRAP) {
        syncHistory().catch((err) => console.error('❌ History bootstrap failed:', err));
      }
    }
  })
  .catch((err) => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  });
