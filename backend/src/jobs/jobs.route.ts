import { timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { env } from '../config/env';
import { runAllJobs } from '.';

function isAuthorized(header: string | undefined, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * POST /jobs/run with `Authorization: Bearer $CRON_SECRET` runs every job and responds
 * once they finish, so the caller (a scheduled GitHub Action) sees the run's outcome.
 * The route is off (404) unless CRON_SECRET is set.
 */
export function createJobsRouter(): Router {
  const router = Router();

  router.post('/run', async (req, res) => {
    if (!env.CRON_SECRET) {
      res.sendStatus(404);
      return;
    }
    if (!isAuthorized(req.header('authorization'), env.CRON_SECRET)) {
      res.sendStatus(401);
      return;
    }
    const startedAt = Date.now();
    await runAllJobs();
    res.json({ ok: true, durationMs: Date.now() - startedAt });
  });

  return router;
}
