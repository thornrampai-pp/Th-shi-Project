// After an integration run, empty the test Redis database so pending statements,
// cached reads and locks from one run never leak into the next. Never touches the dev
// database: it only flushes when the test URL is a different database.
import { config } from 'dotenv';
import Redis from 'ioredis';
import { isSeparateFromDev, testRedisUrl } from './redis-test-url';

export default function setup() {
  return async function teardown() {
    if (process.env.RUN_INTEGRATION_TESTS !== 'true') return;
    config({ quiet: true });
    const devUrl = process.env.REDIS_URL;
    if (!devUrl) return;
    const testUrl = testRedisUrl(devUrl, process.env.TEST_REDIS_URL);
    if (!isSeparateFromDev(testUrl, devUrl)) return;

    const redis = new Redis(testUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await redis.connect();
      await redis.flushdb();
    } catch {
      // A missing test Redis isn't worth failing the run over.
    } finally {
      redis.disconnect();
    }
  };
}
