// ⚠️ INTEGRATION TEST — hits a REAL PostgreSQL database and Redis. Not run by `npm
// test` by default: `npm run test:integration` (see src/test-utils/integration.ts).
//
// Yahoo is mocked so requestSnapshotRebuild's fire-and-forget background repair never
// makes a real network call (its result isn't awaited or asserted on here either way —
// only the synchronous ownership check and return value are).
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../common/integrations/yahoo-finance.util", () => ({
  fetchYahooQuote: vi.fn().mockResolvedValue({ regularMarketPrice: 1 }),
  fetchYahooQuotes: vi.fn().mockResolvedValue([]),
  fetchYahooHistorical: vi.fn().mockResolvedValue([]),
}));

import { redis } from "../../config/redis";
import * as historyService from "./history.service";
import { runIntegrationTests, createTestUser, createTestPortfolio, cleanupTestUser } from "../../test-utils/integration";

const SYNCED_AT_KEY = "history:synced-at";

describe.skipIf(!runIntegrationTests)("history.service (real DB + Redis)", () => {
  describe("getLastSyncedAt", () => {
    afterEach(() => redis.del(SYNCED_AT_KEY));

    it("is null before any sync has run", async () => {
      await redis.del(SYNCED_AT_KEY);
      await expect(historyService.getLastSyncedAt()).resolves.toBeNull();
    });

    it("reflects whatever was last recorded", async () => {
      const now = new Date().toISOString();
      await redis.set(SYNCED_AT_KEY, now);
      await expect(historyService.getLastSyncedAt()).resolves.toBe(now);
    });
  });

  describe("requestSnapshotRebuild", () => {
    it("rejects a portfolio the caller doesn't own", async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      const portfolio = await createTestPortfolio(owner.id);

      await expect(historyService.requestSnapshotRebuild(stranger.id, portfolio.id)).rejects.toThrow(/not found/i);

      await cleanupTestUser(owner.id);
      await cleanupTestUser(stranger.id);
    });

    it("accepts the request for the owner", async () => {
      const owner = await createTestUser();
      const portfolio = await createTestPortfolio(owner.id);

      await expect(historyService.requestSnapshotRebuild(owner.id, portfolio.id)).resolves.toBe(true);

      await cleanupTestUser(owner.id);
    });
  });
});
