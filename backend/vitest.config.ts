import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `npm run build` writes compiled copies of the tests to dist/ — never run those.
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    // Integration runs use their own Redis database (see src/test-utils/redis-test-url.ts).
    setupFiles: ['src/test-utils/vitest-setup.ts'],
    globalSetup: ['src/test-utils/vitest-global-setup.ts'],
  },
});
