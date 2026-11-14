// ⚠️ INTEGRATION TEST — hits a REAL PostgreSQL database. Not run by `npm test` by default.
// R2 is mocked (no uploaded files); the slip is passed in already read, so no Gemini call.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../history/history.service", () => ({
  refreshHistoryAfterTransaction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../common/integrations/r2-storage.util", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../common/integrations/r2-storage.util")>()),
  isR2Configured: () => true,
  putObject: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../config/prisma";
import type { SlipExtraction } from "../../common/integrations/gemini.util";
import { createTransactionFromSlip } from "./slip.service";
import {
  runIntegrationTests,
  createTestUser,
  createTestPortfolio,
  createTestAsset,
  createCashAccount,
  cleanupTestUser,
} from "../../test-utils/integration";

// Smallest thing the image check accepts: the PNG signature.
const PNG = { imageBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64"), mimeType: "image/png" };

describe.skipIf(!runIntegrationTests)("slip.service — paying for a BUY from a slip (real DB)", () => {
  let userId: string;
  let home: string;
  let other: string;
  let asset: { id: string; symbol: string };
  let extracted: SlipExtraction;
  const draft = () => ({ type: "BUY" as const, symbol: asset.symbol, quantity: 2, price: 50, fee: null });

  beforeEach(async () => {
    process.env.GEMINI_API_KEY ||= "test";
    userId = (await createTestUser()).id;
    home = (await createTestPortfolio(userId, { type: "REAL", baseCurrency: "THB", name: "Home" })).id;
    other = (await createTestPortfolio(userId, { type: "REAL", baseCurrency: "THB", name: "Other" })).id;
    asset = await createTestAsset({ currency: "THB" });
    extracted = {
      amount: 100, currency: "THB", transactionDate: "2026-02-01T10:00:00+07:00", transRef: `REF-${Date.now()}-${Math.random()}`,
      orderRef: null, sendingBank: null, receivingBank: null, senderName: null, fee: null, vat: null, netAmount: null,
      fxRate: null, targetAmount: null, targetCurrency: null, assetSymbol: asset.symbol, quantity: 2, price: 50,
      transactionType: "BUY", confidence: "high",
    };
  });

  afterEach(async () => {
    await cleanupTestUser(userId, [asset.id]);
  });

  const cashOf = async (pid: string) =>
    Number((await prisma.cashAccount.findFirst({ where: { portfolioId: pid, currency: "THB" } }))?.balance ?? 0);

  it("asks where the money comes from before recording, showing the cash it has", async () => {
    await createCashAccount(home, { balance: 30 });
    const result = await createTransactionFromSlip(userId, home, PNG, extracted, draft(), false);
    expect(result).toMatchObject({
      status: "needs_input",
      need: "funding",
      funding: { currency: "THB", buyAmount: 100, available: 30, shortfall: 70, kind: "has_cash" },
    });
    expect(await prisma.transaction.count({ where: { portfolioId: home, type: "BUY" } })).toBe(0);
  });

  it("with no cash anywhere, the question says it must be topped up", async () => {
    const result = await createTransactionFromSlip(userId, home, PNG, extracted, draft(), false);
    expect(result).toMatchObject({ need: "funding", funding: { kind: "no_cash", shortfall: 100 } });
  });

  it("counts every portfolio's cash as one shared pool", async () => {
    await createCashAccount(home, { balance: 30 });
    await createCashAccount(other, { balance: 500 });
    const result = await createTransactionFromSlip(userId, home, PNG, extracted, draft(), false);
    expect(result).toMatchObject({ funding: { cash: 530, available: 530, shortfall: 0, kind: "has_cash" } });
  });

  it("records it the way the user chose: cash first, then a deposit for the rest", async () => {
    await createCashAccount(home, { balance: 30 });
    const result = await createTransactionFromSlip(userId, home, PNG, extracted, draft(), false, "CASH_FIRST");
    expect(result.status).toBe("created");
    expect(await cashOf(home)).toBeCloseTo(0);
    const deps = await prisma.transaction.findMany({ where: { portfolioId: home, type: "DEPOSIT" } });
    expect(deps.map((d) => Number(d.baseCurrAmount))).toEqual([70]);
  });

  it("cash first draws on the other portfolios too", async () => {
    await createCashAccount(other, { balance: 500 });
    await createTransactionFromSlip(userId, home, PNG, extracted, draft(), false, "CASH_FIRST");
    expect(await cashOf(other)).toBeCloseTo(400);
    expect(await cashOf(home)).toBeCloseTo(0);
  });

  it("a SELL needs no question", async () => {
    const sellDraft = { ...draft(), type: "SELL" as const };
    const result = await createTransactionFromSlip(userId, home, PNG, { ...extracted, transactionType: "SELL" }, sellDraft, false);
    expect(result).not.toMatchObject({ need: "funding" });
  });
});
