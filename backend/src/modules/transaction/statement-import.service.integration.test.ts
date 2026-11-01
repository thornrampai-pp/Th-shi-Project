// ⚠️ INTEGRATION TEST — hits a REAL PostgreSQL database and Redis. Not run by `npm test`
// by default: `npm run test:integration` (see src/test-utils/integration.ts).
// Gemini and R2 are mocked: no network, no uploaded files.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../history/history.service", () => ({
  refreshHistoryAfterTransaction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../common/integrations/gemini.util", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../common/integrations/gemini.util")>()),
  extractStatementData: vi.fn(),
}));
vi.mock("../../common/integrations/r2-storage.util", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../common/integrations/r2-storage.util")>()),
  putObject: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../config/prisma";
import { extractStatementData } from "../../common/integrations/gemini.util";
import { createTransaction } from "./transaction.service";
import { confirmStatement, previewStatement } from "./statement-import.service";
import {
  runIntegrationTests,
  createTestUser,
  createTestPortfolio,
  createTestAsset,
  cleanupTestUser,
} from "../../test-utils/integration";

const mockExtract = vi.mocked(extractStatementData);
const upload = { imageBase64: Buffer.from("%PDF-1.4\nstatement").toString("base64"), mimeType: "application/pdf" };

describe.skipIf(!runIntegrationTests)("statement-import.service (real DB)", () => {
  let userId: string;
  let held: { id: string; symbol: string }; // already in portfolio `home`
  let fresh: { id: string; symbol: string }; // in no portfolio yet
  let home: string;
  let other: string;
  const orderIds = { held: "", fresh: "" };

  beforeEach(async () => {
    userId = (await createTestUser()).id;
    home = (await createTestPortfolio(userId, { type: "REAL", baseCurrency: "THB" })).id;
    other = (await createTestPortfolio(userId, { type: "REAL", baseCurrency: "THB" })).id;
    held = await createTestAsset({ currency: "THB" });
    fresh = await createTestAsset({ currency: "THB" });
    await createTransaction(userId, { portfolioId: home, type: "BUY", assetId: held.id, quantity: 1, price: 10, fundWithDeposit: true });

    orderIds.held = `ORD-H-${Date.now()}`;
    orderIds.fresh = `ORD-F-${Date.now()}`;
    mockExtract.mockResolvedValue({
      broker: "Test Broker",
      rows: [
        { orderId: orderIds.held, date: "2026-01-05", transactionType: "BUY", symbol: held.symbol, quantity: 2, price: 10, currency: "THB", fee: 0, totalAmount: 20 },
        { orderId: orderIds.fresh, date: "2026-01-05", transactionType: "BUY", symbol: fresh.symbol, quantity: 3, price: 20, currency: "THB", fee: 0, totalAmount: 60 },
        { orderId: null, date: "2026-01-05", transactionType: "BUY", symbol: held.symbol, quantity: 1, price: 10, currency: "THB", fee: 0, totalAmount: 10 },
      ],
    });
  });

  afterEach(async () => {
    await cleanupTestUser(userId, [held.id, fresh.id]);
  });

  it("groups rows by asset: one already held goes to its portfolio, a new one has to be asked about", async () => {
    const preview = await previewStatement(userId, upload);
    const bySymbol = new Map(preview.groups.map((g) => [g.symbol, g]));

    expect(bySymbol.get(held.symbol)).toMatchObject({ rowCount: 1, heldInPortfolioIds: [home], suggestedPortfolioId: home });
    expect(bySymbol.get(fresh.symbol)).toMatchObject({ rowCount: 1, heldInPortfolioIds: [], suggestedPortfolioId: null });
    expect(preview.unreadableCount).toBe(1); // the row without an order id
    expect(await prisma.transaction.count({ where: { externalRef: { in: [orderIds.held, orderIds.fresh] } } })).toBe(0); // nothing recorded yet
  });

  it("an asset held in two portfolios isn't guessed", async () => {
    await createTransaction(userId, { portfolioId: other, type: "BUY", assetId: held.id, quantity: 1, price: 10, fundWithDeposit: true });
    const group = (await previewStatement(userId, upload)).groups.find((g) => g.symbol === held.symbol)!;
    expect(group.heldInPortfolioIds.sort()).toEqual([home, other].sort());
    expect(group.suggestedPortfolioId).toBeNull();
  });

  it("records each asset in its chosen portfolio — an existing one, or a new one — sharing one stored file", async () => {
    const { statementId } = await previewStatement(userId, upload);
    const result = await confirmStatement(userId, statementId, [
      { symbol: held.symbol, portfolioId: home },
      { symbol: fresh.symbol, newPortfolioName: "Brand new" },
    ]);

    expect(result.rows.map((r) => r.status)).toEqual(["created", "created", "unreadable"]);

    const newPortfolio = await prisma.portfolio.findFirstOrThrow({ where: { userId, name: "Brand new" } });
    const heldTx = await prisma.transaction.findFirstOrThrow({ where: { externalRef: orderIds.held } });
    const freshTx = await prisma.transaction.findFirstOrThrow({ where: { externalRef: orderIds.fresh } });
    expect(heldTx.portfolioId).toBe(home);
    expect(freshTx.portfolioId).toBe(newPortfolio.id);

    const slips = await prisma.slipVerification.findMany({ where: { transactionId: { in: [heldTx.id, freshTx.id] } } });
    expect(slips).toHaveLength(2);
    expect(new Set(slips.map((s) => s.imageKey)).size).toBe(1);
  });

  it("re-importing the same statement records nothing twice", async () => {
    const assignments = [
      { symbol: held.symbol, portfolioId: home },
      { symbol: fresh.symbol, portfolioId: other },
    ];
    await confirmStatement(userId, (await previewStatement(userId, upload)).statementId, assignments);
    const again = await confirmStatement(userId, (await previewStatement(userId, upload)).statementId, assignments);

    expect(again.rows.map((r) => r.status)).toEqual(["duplicate", "duplicate", "unreadable"]);
    expect(await prisma.transaction.count({ where: { externalRef: { in: [orderIds.held, orderIds.fresh] } } })).toBe(2);
  });

  it("skips an asset that was given no portfolio, with a clear reason", async () => {
    const result = await confirmStatement(userId, (await previewStatement(userId, upload)).statementId, [
      { symbol: held.symbol, portfolioId: home },
    ]);
    expect(result.rows[1]).toMatchObject({ status: "unreadable", message: expect.stringContaining(fresh.symbol) });
    expect(await prisma.transaction.count({ where: { externalRef: orderIds.fresh } })).toBe(0);
  });

  it("can't be confirmed twice, or by someone else", async () => {
    const { statementId } = await previewStatement(userId, upload);
    const stranger = await createTestUser();
    try {
      await expect(confirmStatement(stranger.id, statementId, [])).rejects.toThrow(/expired/i);
    } finally {
      await cleanupTestUser(stranger.id);
    }
    await confirmStatement(userId, statementId, [{ symbol: held.symbol, portfolioId: home }]);
    await expect(confirmStatement(userId, statementId, [])).rejects.toThrow(/expired/i);
  });

  it("refuses to place rows into a portfolio that isn't the user's", async () => {
    const stranger = await createTestUser();
    const theirs = await createTestPortfolio(stranger.id);
    try {
      const { statementId } = await previewStatement(userId, upload);
      await expect(confirmStatement(userId, statementId, [{ symbol: held.symbol, portfolioId: theirs.id }])).rejects.toThrow();
      expect(await prisma.transaction.count({ where: { externalRef: orderIds.held } })).toBe(0);
    } finally {
      await cleanupTestUser(stranger.id);
    }
  });
});
