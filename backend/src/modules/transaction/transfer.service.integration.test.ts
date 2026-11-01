// ⚠️ INTEGRATION TEST — hits a REAL PostgreSQL database. Not run by `npm test` by
// default: `npm run test:integration` (see src/test-utils/integration.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../history/history.service", () => ({
  refreshHistoryAfterTransaction: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../config/prisma";
import { createTransaction } from "./transaction.service";
import { transferAsset } from "./transfer.service";
import { createSnapshot, getPortfolioHoldings } from "../snapshot/snapshot.service";
import {
  runIntegrationTests,
  createTestUser,
  createTestPortfolio,
  createTestAsset,
  createCashAccount,
  cleanupTestUser,
} from "../../test-utils/integration";

describe.skipIf(!runIntegrationTests)("transfer.service (real DB)", () => {
  let userId: string;
  let fromId: string;
  let toId: string;
  let assetId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const from = await createTestPortfolio(userId, { type: "REAL", baseCurrency: "THB" });
    fromId = from.id;
    const to = await createTestPortfolio(userId, { type: "REAL", baseCurrency: "THB" });
    toId = to.id;
    const asset = await createTestAsset({ currency: "THB" });
    assetId = asset.id;
    await createCashAccount(fromId, { balance: 1_000_000 });
  });

  afterEach(async () => {
    await cleanupTestUser(userId, [assetId]);
  });

  it("rejects transferring to the same portfolio", async () => {
    await expect(transferAsset(userId, { fromPortfolioId: fromId, toPortfolioId: fromId, assetId, quantity: 1 })).rejects.toThrow(
      /must be different/i,
    );
  });

  it("rejects transferring more than is held", async () => {
    await createTransaction(userId, { portfolioId: fromId, type: "BUY", assetId, quantity: 5, price: 100 });
    await expect(
      transferAsset(userId, { fromPortfolioId: fromId, toPortfolioId: toId, assetId, quantity: 10 }),
    ).rejects.toThrow(/not enough shares/i);
  });

  it("moves cost basis across two FIFO lots without realizing any P/L", async () => {
    await createTransaction(userId, { portfolioId: fromId, type: "BUY", assetId, quantity: 10, price: 100 });
    await createTransaction(userId, { portfolioId: fromId, type: "BUY", assetId, quantity: 5, price: 200 });

    const { out, in: inTx } = await transferAsset(userId, {
      fromPortfolioId: fromId,
      toPortfolioId: toId,
      assetId,
      quantity: 12,
    });

    expect(out.type).toBe("TRANSFER_OUT");
    expect(inTx.type).toBe("TRANSFER_IN");
    expect(inTx.parentTxId).toBe(out.id);
    expect(Number(out.baseCurrAmount)).toBeCloseTo(1400); // 10*100 + 2*200
    expect(Number(inTx.baseCurrAmount)).toBeCloseTo(1400);

    const sourcePosition = await prisma.position.findUniqueOrThrow({
      where: { portfolioId_assetId: { portfolioId: fromId, assetId } },
    });
    expect(Number(sourcePosition.quantity)).toBeCloseTo(3);
    expect(Number(sourcePosition.avgPrice)).toBeCloseTo(200); // remaining 3 units all from the second lot

    const destPosition = await prisma.position.findUniqueOrThrow({
      where: { portfolioId_assetId: { portfolioId: toId, assetId } },
    });
    expect(Number(destPosition.quantity)).toBeCloseTo(12);
    expect(Number(destPosition.avgPrice)).toBeCloseTo(1400 / 12);

    const destLots = await prisma.taxLot.findMany({ where: { portfolioId: toId, assetId }, orderBy: { purchasePrice: "asc" } });
    expect(destLots).toHaveLength(2);
    expect(Number(destLots[0]!.remainingQty)).toBeCloseTo(10);
    expect(Number(destLots[0]!.purchasePrice)).toBeCloseTo(100);
    expect(Number(destLots[1]!.remainingQty)).toBeCloseTo(2);
    expect(Number(destLots[1]!.purchasePrice)).toBeCloseTo(200);

    const sourceLots = await prisma.taxLot.findMany({ where: { portfolioId: fromId, assetId } });
    const remainingSourceQty = sourceLots.reduce((sum, l) => sum + Number(l.remainingQty), 0);
    expect(remainingSourceQty).toBeCloseTo(3);

    // Each side's own ledger entries balance (debit === credit), ASSET/EQUITY only — no cash moved.
    for (const transactionId of [out.id, inTx.id]) {
      const entries = await prisma.ledgerEntry.findMany({ where: { transactionId } });
      expect(entries.every((e) => e.accountType === "ASSET" || e.accountType === "EQUITY")).toBe(true);
      const total = (side: string) => entries.filter((e) => e.side === side).reduce((s, e) => s + Number(e.amount), 0);
      expect(total("DEBIT")).toBeCloseTo(1400);
      expect(total("CREDIT")).toBeCloseTo(1400);
    }
    const cashAccount = await prisma.cashAccount.findFirstOrThrow({ where: { portfolioId: fromId } });
    expect(Number(cashAccount.balance)).toBeCloseTo(1_000_000 - (10 * 100 + 5 * 200)); // only the two BUYs touched cash
  });

  it("merges into an existing destination position with a weighted-average cost", async () => {
    await createTransaction(userId, { portfolioId: fromId, type: "BUY", assetId, quantity: 10, price: 100 });
    await createCashAccount(toId, { balance: 1_000_000 });
    await createTransaction(userId, { portfolioId: toId, type: "BUY", assetId, quantity: 10, price: 50 });

    await transferAsset(userId, { fromPortfolioId: fromId, toPortfolioId: toId, assetId, quantity: 10 });

    const destPosition = await prisma.position.findUniqueOrThrow({
      where: { portfolioId_assetId: { portfolioId: toId, assetId } },
    });
    expect(Number(destPosition.quantity)).toBeCloseTo(20);
    expect(Number(destPosition.avgPrice)).toBeCloseTo((10 * 50 + 10 * 100) / 20);
  });

  it("rejects a transfer dated before the shares being moved were bought", async () => {
    await createTransaction(userId, {
      portfolioId: fromId,
      type: "BUY",
      assetId,
      quantity: 5,
      price: 100,
      executedAt: new Date("2026-01-10T05:00:00Z"),
    });
    await expect(
      transferAsset(userId, {
        fromPortfolioId: fromId,
        toPortfolioId: toId,
        assetId,
        quantity: 5,
        executedAt: new Date("2026-01-01T05:00:00Z"),
      }),
    ).rejects.toThrow(/before the shares/i);
    // Nothing was half-applied.
    expect(await prisma.transaction.count({ where: { type: { in: ["TRANSFER_OUT", "TRANSFER_IN"] }, portfolioId: { in: [fromId, toId] } } })).toBe(0);
  });

  // The Position/TaxLot tables are only half the story: holdings, valuation and
  // snapshots are rebuilt by replaying the transaction log.
  describe("what the app shows after a transfer (rebuilt from the transaction log)", () => {
    async function seed() {
      await createTransaction(userId, {
        portfolioId: fromId, type: "BUY", assetId, quantity: 10, price: 100,
        fundWithDeposit: true, executedAt: new Date("2026-01-05T05:00:00Z"),
      });
      await createTransaction(userId, {
        portfolioId: toId, type: "BUY", assetId, quantity: 5, price: 100,
        fundWithDeposit: true, executedAt: new Date("2026-01-05T05:00:00Z"),
      });
      await transferAsset(userId, {
        fromPortfolioId: fromId, toPortfolioId: toId, assetId, quantity: 4,
        executedAt: new Date("2026-01-12T05:00:00Z"),
      });
    }

    it("holdings agree with the Position table on both sides", async () => {
      await seed();
      const source = await getPortfolioHoldings(userId, fromId);
      const dest = await getPortfolioHoldings(userId, toId);
      expect(source.holdings.map((h) => [h.assetId, h.quantity])).toEqual([[assetId, 6]]);
      expect(dest.holdings.map((h) => [h.assetId, h.quantity])).toEqual([[assetId, 9]]);
      // Cost basis is conserved: 15 shares @ 100 before, 6 + 9 after.
      expect(source.costBasis + dest.costBasis).toBeCloseTo(1500);
    });

    it("a transfer isn't a gain or a loss: each side's time-weighted return is just the price move", async () => {
      await seed();
      const closes: [string, number][] = [["2026-01-09", 100], ["2026-01-12", 110], ["2026-01-13", 110]];
      await prisma.assetPrice.createMany({
        data: closes.map(([day, closePrice]) => ({ assetId, timestamp: new Date(`${day}T00:00:00Z`), timeframe: "1D", closePrice })),
      });

      for (const portfolioId of [fromId, toId]) {
        for (const [day] of closes) await createSnapshot(portfolioId, new Date(`${day}T00:00:00Z`));
      }

      const snapshots = (portfolioId: string) =>
        prisma.portfolioSnapshot.findMany({ where: { portfolioId, granularity: "DAILY" }, orderBy: { date: "asc" } });
      const [src, dst] = [await snapshots(fromId), await snapshots(toId)];

      // Jan 12: price +10% and 4 shares (4 × 110 = 440) cross over — out of the source, into the destination.
      expect(Number(src[1]!.netCashFlow)).toBeCloseTo(-440);
      expect(Number(dst[1]!.netCashFlow)).toBeCloseTo(440);
      expect(Number(src[1]!.twrReturn)).toBeCloseTo(10, 6);
      expect(Number(dst[1]!.twrReturn)).toBeCloseTo(10, 6);
      // …and the day after, with nothing happening, 0%.
      expect(Number(src[2]!.twrReturn)).toBeCloseTo(0, 6);
      expect(Number(dst[2]!.twrReturn)).toBeCloseTo(0, 6);
    });
  });
});
