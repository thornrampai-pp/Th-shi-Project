// ⚠️ INTEGRATION TEST — hits a REAL PostgreSQL database. Not run by `npm test` by
// default: `npm run test:integration` (see src/test-utils/integration.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// PAPER fills look up the live market price via Yahoo — mocked so fills are
// deterministic and tests never depend on network/market availability.
vi.mock("../asset/asset.service", () => ({ getLatestPrice: vi.fn() }));
// Fire-and-forget history backfill triggered by every created transaction.
vi.mock("../history/history.service", () => ({
  refreshHistoryAfterTransaction: vi.fn().mockResolvedValue(undefined),
}));

import { getLatestPrice } from "../asset/asset.service";
import { prisma } from "../../config/prisma";
import * as orderService from "./order.service";
import {
  runIntegrationTests,
  createTestUser,
  createTestPortfolio,
  createTestAsset,
  createCashAccount,
  cleanupTestUser,
} from "../../test-utils/integration";

const mockLatestPrice = vi.mocked(getLatestPrice);

describe.skipIf(!runIntegrationTests)("order.service (real DB)", () => {
  let userId: string;
  let assetId: string;

  beforeEach(async () => {
    mockLatestPrice.mockReset();
    const user = await createTestUser();
    userId = user.id;
    const asset = await createTestAsset({ currency: "THB" });
    assetId = asset.id;
  });

  afterEach(async () => {
    await cleanupTestUser(userId, [assetId]);
  });

  describe("placeOrder validation", () => {
    it("rejects a non-positive quantity", async () => {
      const portfolio = await createTestPortfolio(userId, { type: "PAPER" });
      await expect(
        orderService.placeOrder(userId, {
          portfolioId: portfolio.id,
          assetId,
          side: "BUY",
          orderType: "MARKET",
          quantity: 0,
        }),
      ).rejects.toThrow(/quantity must be positive/i);
    });

    it("rejects a LIMIT order without a limitPrice", async () => {
      const portfolio = await createTestPortfolio(userId, { type: "PAPER" });
      await expect(
        orderService.placeOrder(userId, {
          portfolioId: portfolio.id,
          assetId,
          side: "BUY",
          orderType: "LIMIT",
          quantity: 10,
        }),
      ).rejects.toThrow(/LIMIT orders require/i);
    });

    it("rejects an unknown asset", async () => {
      const portfolio = await createTestPortfolio(userId, { type: "PAPER" });
      await expect(
        orderService.placeOrder(userId, {
          portfolioId: portfolio.id,
          assetId: "00000000-0000-0000-0000-000000000000",
          side: "BUY",
          orderType: "MARKET",
          quantity: 10,
        }),
      ).rejects.toThrow(/asset not found/i);
    });
  });

  describe("PAPER MARKET orders", () => {
    it("auto-fills on placement and sets filledQty to the full quantity", async () => {
      const portfolio = await createTestPortfolio(userId, { type: "PAPER", baseCurrency: "THB" });
      await createCashAccount(portfolio.id, { balance: 1_000_000 });
      mockLatestPrice.mockResolvedValue(100);

      const order = await orderService.placeOrder(userId, {
        portfolioId: portfolio.id,
        assetId,
        side: "BUY",
        orderType: "MARKET",
        quantity: 10,
      });

      expect(order.status).toBe("FILLED");
      expect(Number(order.filledQty)).toBe(10);
      expect(order.avgFillPrice).not.toBeNull();
      expect(order.transactionId).not.toBeNull();
    });

    it("rejects the order instead of throwing when no price is available", async () => {
      const portfolio = await createTestPortfolio(userId, { type: "PAPER", baseCurrency: "THB" });
      await createCashAccount(portfolio.id, { balance: 1_000_000 });
      mockLatestPrice.mockResolvedValue(null);

      // placeOrder swallows the fill failure (the order itself was still created) — so
      // the mutation resolves instead of throwing, with the order left REJECTED.
      const order = await orderService.placeOrder(userId, {
        portfolioId: portfolio.id,
        assetId,
        side: "BUY",
        orderType: "MARKET",
        quantity: 10,
      });
      expect(order.status).toBe("REJECTED");
    });

    it("does not auto-fill a REAL portfolio's order", async () => {
      const portfolio = await createTestPortfolio(userId, { type: "REAL", baseCurrency: "THB" });
      await createCashAccount(portfolio.id, { balance: 1_000_000 });
      mockLatestPrice.mockResolvedValue(100);

      const order = await orderService.placeOrder(userId, {
        portfolioId: portfolio.id,
        assetId,
        side: "BUY",
        orderType: "MARKET",
        quantity: 10,
      });
      expect(order.status).toBe("PENDING");
      expect(mockLatestPrice).not.toHaveBeenCalled();
    });
  });

  describe("cancelOrder", () => {
    it("cancels a PENDING order", async () => {
      const portfolio = await createTestPortfolio(userId, { type: "REAL", baseCurrency: "THB" });
      await createCashAccount(portfolio.id, { balance: 1_000_000 });
      const order = await orderService.placeOrder(userId, {
        portfolioId: portfolio.id,
        assetId,
        side: "BUY",
        orderType: "MARKET",
        quantity: 10,
      });

      const cancelled = await orderService.cancelOrder(userId, order.id);
      expect(cancelled.status).toBe("CANCELLED");
    });

    it("rejects cancelling an order that's already FILLED", async () => {
      const portfolio = await createTestPortfolio(userId, { type: "PAPER", baseCurrency: "THB" });
      await createCashAccount(portfolio.id, { balance: 1_000_000 });
      mockLatestPrice.mockResolvedValue(100);
      const order = await orderService.placeOrder(userId, {
        portfolioId: portfolio.id,
        assetId,
        side: "BUY",
        orderType: "MARKET",
        quantity: 10,
      });
      expect(order.status).toBe("FILLED");

      await expect(orderService.cancelOrder(userId, order.id)).rejects.toThrow(/only open orders/i);
    });
  });

  describe("fillOrder (REAL portfolios)", () => {
    it("rejects fillOrder for a PAPER order (those fill automatically)", async () => {
      const portfolio = await createTestPortfolio(userId, { type: "PAPER", baseCurrency: "THB" });
      await createCashAccount(portfolio.id, { balance: 1_000_000 });
      mockLatestPrice.mockResolvedValue(null); // stays PENDING-then-REJECTED, not filled
      const order = await orderService.placeOrder(userId, {
        portfolioId: portfolio.id,
        assetId,
        side: "BUY",
        orderType: "LIMIT",
        limitPrice: 100,
        quantity: 10,
      });

      await expect(
        orderService.fillOrder(userId, order.id, { fillPrice: 100 }),
      ).rejects.toThrow(/filled automatically/i);
    });

    it("records the execution and sets filledQty/avgFillPrice from the actual fill", async () => {
      const portfolio = await createTestPortfolio(userId, { type: "REAL", baseCurrency: "THB" });
      await createCashAccount(portfolio.id, { balance: 1_000_000 });
      const order = await orderService.placeOrder(userId, {
        portfolioId: portfolio.id,
        assetId,
        side: "BUY",
        orderType: "MARKET",
        quantity: 7,
      });
      expect(order.status).toBe("PENDING");

      const filled = await orderService.fillOrder(userId, order.id, { fillPrice: 42, fee: 1 });
      expect(filled.status).toBe("FILLED");
      expect(Number(filled.filledQty)).toBe(7);
      expect(Number(filled.avgFillPrice)).toBe(42);
      expect(filled.transactionId).not.toBeNull();

      const position = await prisma.position.findUniqueOrThrow({
        where: { portfolioId_assetId: { portfolioId: portfolio.id, assetId } },
      });
      expect(Number(position.quantity)).toBe(7);
    });
  });
});
