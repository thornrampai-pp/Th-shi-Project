// Runs before every test file (vitest.config.ts → setupFiles), i.e. before
// src/config/env.ts reads the environment. dotenv never overrides a variable that is
// already set, so the REDIS_URL chosen here wins over the one in .env.
import { config } from 'dotenv';
import { testRedisUrl } from './redis-test-url';

if (process.env.RUN_INTEGRATION_TESTS === 'true') {
  config({ quiet: true });
  if (process.env.REDIS_URL) {
    process.env.DEV_REDIS_URL = process.env.REDIS_URL;
    process.env.REDIS_URL = testRedisUrl(process.env.REDIS_URL, process.env.TEST_REDIS_URL);
  }
}
