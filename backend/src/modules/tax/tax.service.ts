import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/AppError";
import { assertPortfolioOwnership } from "../../common/utils/portfolio-ownership.util";
import { getExchangeRate } from "../fx/fx.service";
import type { LedgerTxClient } from "../ledger/ledger.service";
import { normalizeCountryCode } from "../../common/utils/source-country.util";

export { sourceCountryOf } from "../../common/utils/source-country.util";

export type TaxTypeValue = "PERSONAL_INCOME" | "CAPITAL_GAIN" | "WITHHOLDING";
export type TaxStatusValue = "PENDING" | "FILED" | "PAID";

/** Thai personal income tax is filed in THB, so every TaxRecord is converted to it. */
export const TAX_CURRENCY = "THB";

/**
 * Fetches the FX rate a TaxRecord needs BEFORE the caller opens its DB transaction —
 * a network call must never run while row locks are held. Paper portfolios aren't
 * taxable, so they skip the lookup entirely (returns null = "don't record tax").
 */
export async function resolveTaxFxRate(
  portfolio: { type: string },
  currency: string,
  executedAt: Date,
): Promise<number | null> {
  if (portfolio.type !== "REAL") return null;
  return getExchangeRate(currency, TAX_CURRENCY, executedAt);
}

/** Writes the TaxRecord inside the caller's DB transaction, so it commits with the Transaction. */
export async function recordTax(
  tx: LedgerTxClient,
  params: {
    transactionId: string;
    portfolioId: string;
    taxType: TaxTypeValue;
    sourceCountry: string;
    incomeAmount: number;
    fxRate: number;
    executedAt: Date;
  },
) {
  const year = params.executedAt.getUTCFullYear();
  return tx.taxRecord.create({
    data: {
      transactionId: params.transactionId,
      portfolioId: params.portfolioId,
      taxType: params.taxType,
      sourceCountry: params.sourceCountry,
      incomeAmount: round2(params.incomeAmount),
      convertedAmountTHB: round2(params.incomeAmount * params.fxRate),
      fxRate: params.fxRate,
      taxYear: year,
      earnedYear: year,
    },
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function getUserPortfolioIds(userId: string, portfolioId?: string): Promise<string[]> {
  if (portfolioId) {
    await assertPortfolioOwnership(userId, portfolioId);
    return [portfolioId];
  }
  const portfolios = await prisma.portfolio.findMany({
    where: { userId, deletedAt: null, type: "REAL" },
    select: { id: true },
  });
  return portfolios.map((p) => p.id);
}

export async function listTaxRecords(
  userId: string,
  filters: { taxYear?: number; portfolioId?: string; taxType?: TaxTypeValue; status?: TaxStatusValue },
) {
  const portfolioIds = await getUserPortfolioIds(userId, filters.portfolioId);
  return prisma.taxRecord.findMany({
    where: {
      portfolioId: { in: portfolioIds },
      taxYear: filters.taxYear,
      taxType: filters.taxType,
      status: filters.status,
    },
    include: { transaction: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Status and source country are user-editable; amounts come from the transaction and aren't. */
export async function updateTaxRecord(
  userId: string,
  id: string,
  data: { status?: TaxStatusValue; sourceCountry?: string },
) {
  const record = await prisma.taxRecord.findUnique({ where: { id } });
  if (!record) throw AppError.notFound("Tax record not found");
  await assertPortfolioOwnership(userId, record.portfolioId);

  return prisma.taxRecord.update({
    where: { id },
    data: {
      status: data.status,
      sourceCountry: data.sourceCountry != null ? normalizeCountryCode(data.sourceCountry) : undefined,
    },
    include: { transaction: true },
  });
}

/**
 * Year-level summary for filing (ภ.ง.ด.90): income per type/country in THB, tax already
 * withheld abroad (foreign tax credit candidate), and how much foreign money was
 * brought into Thailand (REPATRIATION) — since 2024, foreign income is assessable in
 * the year it's remitted, so the remittance total is reported alongside the income.
 */
export async function getTaxSummary(userId: string, taxYear: number, portfolioId?: string) {
  const portfolioIds = await getUserPortfolioIds(userId, portfolioId);

  const records = await prisma.taxRecord.findMany({
    where: { portfolioId: { in: portfolioIds }, taxYear },
    include: { transaction: true },
  });

  const byKey = new Map<string, { taxType: string; sourceCountry: string; incomeTHB: number; count: number }>();
  let totalIncomeTHB = 0;
  let withheldTaxTHB = 0;
  let foreignIncomeTHB = 0;

  for (const r of records) {
    const income = Number(r.convertedAmountTHB);
    totalIncomeTHB += income;
    if (r.sourceCountry !== "TH") foreignIncomeTHB += income;
    withheldTaxTHB += Number(r.transaction.taxWithheld) * Number(r.fxRate);

    const key = `${r.taxType}:${r.sourceCountry}`;
    const entry = byKey.get(key) ?? { taxType: r.taxType, sourceCountry: r.sourceCountry, incomeTHB: 0, count: 0 };
    entry.incomeTHB += income;
    entry.count += 1;
    byKey.set(key, entry);
  }

  const yearStart = new Date(Date.UTC(taxYear, 0, 1));
  const yearEnd = new Date(Date.UTC(taxYear + 1, 0, 1));
  const repatriations = await prisma.transaction.findMany({
    where: {
      portfolioId: { in: portfolioIds },
      type: "REPATRIATION",
      executedAt: { gte: yearStart, lt: yearEnd },
    },
  });
  const repatriatedTHB = repatriations.reduce((sum, t) => {
    const meta = (t.metadata ?? {}) as { targetAmount?: number };
    return sum + Number(meta.targetAmount ?? 0);
  }, 0);

  return {
    taxYear,
    currency: TAX_CURRENCY,
    totalIncomeTHB: round2(totalIncomeTHB),
    foreignIncomeTHB: round2(foreignIncomeTHB),
    withheldTaxTHB: round2(withheldTaxTHB),
    repatriatedTHB: round2(repatriatedTHB),
    pendingCount: records.filter((r) => r.status === "PENDING").length,
    breakdown: Array.from(byKey.values()).map((e) => ({ ...e, incomeTHB: round2(e.incomeTHB) })),
  };
}

/** Open (not fully sold) lots — what a FIFO sell would consume next, oldest first. */
export async function listOpenTaxLots(userId: string, portfolioId: string, assetId?: string) {
  await assertPortfolioOwnership(userId, portfolioId);
  return prisma.taxLot.findMany({
    where: { portfolioId, assetId, remainingQty: { gt: 0 } },
    include: { asset: true },
    orderBy: { executedAt: "asc" },
  });
}
