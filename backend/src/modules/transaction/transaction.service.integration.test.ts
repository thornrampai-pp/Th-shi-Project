// ⚠️ INTEGRATION TEST — hits a REAL PostgreSQL database. Not run by `npm test` by
// default: `npm run test:integration` (see src/test-utils/integration.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// createTransaction fires this off in the background (errors are swallowed) to backfill
// price history — never awaited, but still makes real Yahoo calls if left unmocked.
vi.mock("../history/history.service", () => ({
  refreshHistoryAfterTransaction: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/AppError";
import { createTransaction } from "./transaction.service";
import {
  runIntegrationTests,
  createTestUser,
  createTestPortfolio,
  createTestAsset,
  createCashAccount,
  cleanupTestUser,
} from "../../test-utils/integration";

describe.skipIf(!runIntegrationTests)("transaction.service (real DB)", () => {
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
  });

  afterEach(async () => {
    await cleanupTestUser(userId, [assetId]);
  });

  describe("BUY", () => {
    it("rejects a non-positive quantity or price", async () => {
      await createCashAccount(portfolioId, { balance: 100_000 });
      await expect(
        createTransaction(userId, { portfolioId, type: "BUY", assetId, quantity: 0, price: 10 }),
      ).rejects.toThrow(/must be positive/i);
      await expect(
        createTransaction(userId, { portfolioId, type: "BUY", assetId, quantity: 10, price: -1 }),
      ).rejects.toThrow(/must be positive/i);
    });

    it("rejects when there's no cash account for the currency yet", async () => {
      await expect(
        createTransaction(userId, { portfolioId, type: "BUY", assetId, quantity: 10, price: 100 }),
      ).rejects.toThrow(/no.*cash account/i);
    });

    it("debits cash, opens a position, and creates a tax lot", async () => {
      const cash = await createCashAccount(portfolioId, { balance: 100_000 });

      const tx = await createTransaction(userId, {
        portfolioId,
        type: "BUY",
        assetId,
        quantity: 10,
        price: 100,
        fee: 5,
      });
      expect(Number(tx.baseCurrAmount)).toBeCloseTo(1005);

      const updatedCash = await prisma.cashAccount.findUniqueOrThrow({ where: { id: cash.id } });
      expect(Number(updatedCash.balance)).toBeCloseTo(100_000 - 1005);

      const position = await prisma.position.findUniqueOrThrow({
        where: { portfolioId_assetId: { portfolioId, assetId } },
      });
      expect(Number(position.quantity)).toBe(10);
      expect(Number(position.avgPrice)).toBeCloseTo(100.5);

      const lot = await prisma.taxLot.findFirstOrThrow({ where: { portfolioId, assetId } });
      expect(Number(lot.remainingQty)).toBe(10);
    });

    it("rejects a BUY that would push a non-margin portfolio's cash negative", async () => {
      await createCashAccount(portfolioId, { balance: 500 });
      await expect(
        createTransaction(userId, { portfolioId, type: "BUY", assetId, quantity: 10, price: 100 }),
      ).rejects.toThrow(/insufficient/i);
    });

    it("fundWithDeposit creates the cash account on the fly instead of requiring one upfront", async () => {
      const tx = await createTransaction(userId, {
        portfolioId,
        type: "BUY",
        assetId,
        quantity: 5,
        price: 50,
        fundWithDeposit: true,
      });
      expect(Number(tx.baseCurrAmount)).toBeCloseTo(250);

      const position = await prisma.position.findUniqueOrThrow({
        where: { portfolioId_assetId: { portfolioId, assetId } },
      });
      expect(Number(position.quantity)).toBe(5);
    });
  });

  describe("SELL", () => {
    async function buy(quantity: number, price: number) {
      await createCashAccount(portfolioId, { balance: 1_000_000 });
      await createTransaction(userId, { portfolioId, type: "BUY", assetId, quantity, price });
    }

    it("rejects selling more than is held", async () => {
      await buy(5, 100);
      await expect(
        createTransaction(userId, { portfolioId, type: "SELL", assetId, quantity: 10, price: 100 }),
      ).rejects.toThrow(/not enough shares/i);
    });

    it("reduces the position and credits cash for proceeds (FIFO)", async () => {
      await buy(10, 100);
      const cashBefore = await prisma.cashAccount.findFirstOrThrow({ where: { portfolioId, currency: "THB" } });

      await createTransaction(userId, { portfolioId, type: "SELL", assetId, quantity: 4, price: 150 });

      const position = await prisma.position.findUniqueOrThrow({
        where: { portfolioId_assetId: { portfolioId, assetId } },
      });
      expect(Number(position.quantity)).toBe(6);

      const cashAfter = await prisma.cashAccount.findUniqueOrThrow({ where: { id: cashBefore.id } });
      expect(Number(cashAfter.balance)).toBeCloseTo(Number(cashBefore.balance) + 4 * 150);

      const lot = await prisma.taxLot.findFirstOrThrow({ where: { portfolioId, assetId } });
      expect(Number(lot.remainingQty)).toBe(6);
    });
  });

  describe("unsupported type", () => {
    it("rejects a transaction type with no handler", async () => {
      await expect(
        // @ts-expect-error — deliberately invalid to exercise the default branch
        createTransaction(userId, { portfolioId, type: "NOT_A_REAL_TYPE" }),
      ).rejects.toThrow(AppError);
    });
  });
});
