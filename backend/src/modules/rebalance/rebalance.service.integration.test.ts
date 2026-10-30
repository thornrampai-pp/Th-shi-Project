// ⚠️ INTEGRATION TEST — hits a REAL PostgreSQL database. Not run by `npm test` by
// default: `npm run test:integration` (see src/test-utils/integration.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../history/history.service", () => ({
  refreshHistoryAfterTransaction: vi.fn().mockResolvedValue(undefined),
}));

import { createTransaction } from "../transaction/transaction.service";
import { setPositionTargetWeight } from "../transaction/transaction.service";
import { getRebalanceDrift, recordRebalance, listRebalanceLogs } from "./rebalance.service";
import {
  runIntegrationTests,
  createTestUser,
  createTestPortfolio,
  createTestAsset,
  createCashAccount,
  cleanupTestUser,
} from "../../test-utils/integration";

describe.skipIf(!runIntegrationTests)("rebalance.service (real DB)", () => {
  let userId: string;
  let portfolioId: string;
  let assetId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const portfolio = await createTestPortfolio(userId, { type: "REAL", baseCurrency: "THB" });
    portfolioId = portfolio.id;
    const asset = await createTestAsset({ currency: "THB" });
    assetId = asset.id;
    await createCashAccount(portfolioId, { balance: 1_000_000 });
    await createTransaction(userId, { portfolioId, type: "BUY", assetId, quantity: 10, price: 100 });
  });

  afterEach(async () => {
    await cleanupTestUser(userId, [assetId]);
  });

  describe("setPositionTargetWeight", () => {
    it("rejects a target outside 0-100", async () => {
      await expect(setPositionTargetWeight(userId, portfolioId, assetId, 150)).rejects.toThrow(/between 0 and 100/i);
      await expect(setPositionTargetWeight(userId, portfolioId, assetId, -1)).rejects.toThrow(/between 0 and 100/i);
    });

    it("rejects a position that doesn't exist yet", async () => {
      const otherAsset = await createTestAsset({ currency: "THB" });
      await expect(setPositionTargetWeight(userId, portfolioId, otherAsset.id, 50)).rejects.toThrow(/not found/i);
    });

    it("sets and clears the target", async () => {
      const updated = await setPositionTargetWeight(userId, portfolioId, assetId, 50);
      expect(Number(updated.targetWeight)).toBe(50);

      const cleared = await setPositionTargetWeight(userId, portfolioId, assetId, null);
      expect(cleared.targetWeight).toBeNull();
    });
  });

  describe("getRebalanceDrift", () => {
    it("rejects when nothing has a target weight set", async () => {
      await expect(getRebalanceDrift(userId, portfolioId)).rejects.toThrow(/no position.*target weight/i);
    });

    it("computes drift and suggests a sell when overweight", async () => {
      // Sole holding: currently 100% of the book. Target it down to 50%.
      await setPositionTargetWeight(userId, portfolioId, assetId, 50);

      const report = await getRebalanceDrift(userId, portfolioId);
      expect(report.totalValue).toBeCloseTo(1000);
      expect(report.items).toHaveLength(1);

      const item = report.items[0]!;
      expect(item.currentWeight).toBeCloseTo(100);
      expect(item.targetWeight).toBe(50);
      expect(item.driftPct).toBeCloseTo(50);
      expect(item.suggestedValue).toBeCloseTo(-500); // sell down to 500
      expect(item.suggestedQuantity).toBeCloseTo(-5);
    });
  });

  describe("recordRebalance + listRebalanceLogs", () => {
    it("snapshots the drift into a RebalanceLog", async () => {
      await setPositionTargetWeight(userId, portfolioId, assetId, 50);

      const log = await recordRebalance(userId, portfolioId, "manual check-in");
      expect(Number(log.totalValueBefore)).toBeCloseTo(1000);
      expect(log.description).toBe("manual check-in");
      expect(log.driftBefore).toMatchObject([{ assetId, targetWeight: 50 }]);

      const logs = await listRebalanceLogs(userId, portfolioId);
      expect(logs.map((l) => l.id)).toContain(log.id);
    });
  });
});
