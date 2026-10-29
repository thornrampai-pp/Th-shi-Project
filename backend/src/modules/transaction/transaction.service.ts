import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/AppError";
import { assertPortfolioOwnership } from "../../common/utils/portfolio-ownership.util";
import { postLedgerEntries } from "../ledger/ledger.service";
import type { LedgerEntryInput, LedgerTxClient } from "../ledger/ledger.service";
import { notifyEvent } from "../notification/notification.service";
import { normalizeCountryCode } from "../../common/utils/source-country.util";
import { refreshHistoryAfterTransaction } from "../history/history.service";
import { getExchangeRate, resolveHomeFxRate } from "../fx/fx.service";
import { splitPL } from "./fx-pl";
import type { FxLot } from "./fx-pl";
import {
  TAX_CURRENCY,
  recordTax,
  resolveTaxFxRate,
  sourceCountryOf,
} from "../tax/tax.service";

export type TransactionTypeValue =
  | "BUY"
  | "SELL"
  | "DEPOSIT"
  | "WITHDRAW"
  | "DIVIDEND"
  | "REPATRIATION"
  | "FEE"
  | "TAX"
  | "SPLIT"
  | "ADJUSTMENT";

/**
 * Field usage per type:
 * - BUY / SELL:     assetId, quantity, price, fee?, currency? (defaults to the asset's);
 *                   BUY also takes fundWithDeposit? to record a holding bought elsewhere
 * - DEPOSIT / WITHDRAW / FEE / TAX: amount, currency
 * - DIVIDEND:       assetId, amount (net cash received), currency, taxWithheld?
 * - ADJUSTMENT:     amount (signed: + adds cash, − removes cash), currency
 * - SPLIT:          assetId, ratio (2 = 2-for-1 split, 0.1 = 1-for-10 reverse split)
 * - REPATRIATION:   amount (in foreign `currency`), price? (= FX rate actually used;
 *                   fetched from Yahoo if omitted) — moves foreign cash into the
 *                   domestic THB cash account
 */
export interface CreateTransactionInput {
  portfolioId: string;
  type: TransactionTypeValue;
  assetId?: string;
  quantity?: number;
  price?: number;
  amount?: number;
  currency?: string;
  fee?: number;
  taxWithheld?: number;
  ratio?: number;
  /** Override for the TaxRecord's income-source country; defaults from the asset's exchange. */
  sourceCountry?: string;
  note?: string;
  executedAt?: Date;
  /**
   * executedAt carries a real time of day (typed in, or read off a slip) rather than
   * just the day — lets slip matching tell apart several trades on one day.
   */
  timeKnown?: boolean;
  /** Broker order / deal number. Unique per portfolio; never generated. */
  externalRef?: string;
  /** BUY only: deposit the full cost first (creating the cash account if needed), atomically. */
  fundWithDeposit?: boolean;
}

type Portfolio = Awaited<ReturnType<typeof assertPortfolioOwnership>>;

/**
 * Creates a transaction and performs all related accounting operations.
 *
 * Notification is intentionally sent AFTER the DB transaction has committed.
 */
export async function createTransaction(
  userId: string,
  input: CreateTransactionInput,
) {
  const portfolio = await assertPortfolioOwnership(userId, input.portfolioId);

  if (input.sourceCountry != null) {
    input = { ...input, sourceCountry: normalizeCountryCode(input.sourceCountry) };
  }

  const externalRef = input.externalRef?.trim() || undefined;
  input = { ...input, externalRef };
  if (externalRef) {
    // The unique index would also refuse it, but only after the ledger work — say why up front.
    const existing = await prisma.transaction.findFirst({
      where: { portfolioId: input.portfolioId, externalRef },
      select: { id: true },
    });
    if (existing) {
      throw AppError.conflict(`Order ${externalRef} is already recorded in this portfolio`);
    }
  }

  let transaction;

  switch (input.type) {
    case "BUY":
      transaction = await createBuyTransaction(portfolio, input);
      break;

    case "SELL":
      transaction = await createSellTransaction(portfolio, input);
      break;

    case "DEPOSIT":
    case "WITHDRAW":
    case "FEE":
    case "TAX":
    case "ADJUSTMENT":
      transaction = await createCashMovement(input, input.type);
      break;

    case "DIVIDEND":
      transaction = await createDividendTransaction(portfolio, input);
      break;

    case "SPLIT":
      transaction = await createSplitTransaction(input);
      break;

    case "REPATRIATION":
      transaction = await createRepatriationTransaction(input);
      break;

    default:
      throw AppError.badRequest(
        `Transaction type ${String(input.type)} is not supported`,
      );
  }

  /**
   * Notify only after the database transaction has committed.
   *
   * A Discord/notification failure must never rollback financial data.
   */
  notifyEvent(userId, "TRANSACTION_EXECUTED", {
    text: buildTransactionSummary(input, transaction),
  }).catch((err) => {
    console.error("❌ Failed to send transaction notification:", err);
  });

  // Fetch history for anything new (so holdings are valued at market, not cost), and
  // rebuild snapshots if this was dated into the past. Never blocks the response.
  refreshHistoryAfterTransaction(input.portfolioId, transaction.executedAt).catch((err) => {
    console.error("❌ Failed to refresh history after transaction:", err);
  });

  return transaction;
}

function buildTransactionSummary(
  input: CreateTransactionInput,
  transaction: {
    baseCurrAmount: unknown;
  },
): string {
  const amount =
    transaction.baseCurrAmount != null
      ? Number(transaction.baseCurrAmount).toLocaleString()
      : "0";

  switch (input.type) {
    case "BUY":
      return `🟢 ซื้อ ${input.quantity} หน่วย ราคา ${input.price} รวม ${amount}`;

    case "SELL":
      return `🔴 ขาย ${input.quantity} หน่วย ราคา ${input.price} รวม ${amount}`;

    case "DEPOSIT":
      return `💰 ฝากเงิน ${amount} ${input.currency ?? ""}`;

    case "WITHDRAW":
      return `💸 ถอนเงิน ${amount} ${input.currency ?? ""}`;

    case "DIVIDEND":
      return `💵 ได้รับเงินปันผล ${amount} ${input.currency ?? ""}`;

    case "FEE":
      return `🧾 ค่าธรรมเนียม ${amount} ${input.currency ?? ""}`;

    case "TAX":
      return `🏛️ ชำระภาษี ${amount} ${input.currency ?? ""}`;

    case "SPLIT":
      return `✂️ แตกพาร์ อัตรา ${input.ratio ?? input.quantity}:1`;

    case "REPATRIATION":
      return `🏠 นำเงินกลับประเทศ ${input.amount} ${input.currency ?? ""} → ${amount} ${TAX_CURRENCY}`;

    default:
      return `ธุรกรรม ${input.type} มูลค่า ${amount}`;
  }
}

/**
 * Find CashAccount using the Prisma transaction client. When a portfolio has both a
 * domestic and a foreign account in the same currency, `isDomestic` picks one;
 * otherwise whichever exists is used.
 */
async function getCashAccount(
  tx: LedgerTxClient,
  portfolioId: string,
  currency: string,
  isDomestic?: boolean,
) {
  const account = await tx.cashAccount.findFirst({
    where: {
      portfolioId,
      currency,
      isDomestic,
    },
  });

  if (!account) {
    throw AppError.badRequest(
      `No ${currency}${isDomestic == null ? "" : isDomestic ? " (domestic)" : " (foreign)"} cash account for this portfolio — add one first`,
    );
  }

  return account;
}

/** Same lookup as getCashAccount, but creates the account (balance 0) when missing. */
async function getOrCreateCashAccount(
  tx: LedgerTxClient,
  portfolioId: string,
  currency: string,
) {
  const account = await tx.cashAccount.findFirst({ where: { portfolioId, currency } });
  if (account) return account;
  // Same domestic rule as the account createPortfolio() opens.
  return tx.cashAccount.create({
    data: { portfolioId, currency, isDomestic: currency === TAX_CURRENCY, balance: 0 },
  });
}

/**
 * A DEPOSIT posted in the caller's DB transaction, so the purchase it funds commits
 * or rolls back with it. Used when recording a holding bought outside the app —
 * the money was never tracked here, so it has to come in before it can go out.
 *
 * CASH   DEBIT   amount
 * EQUITY CREDIT  amount
 */
async function postFundingDeposit(
  tx: LedgerTxClient,
  params: {
    portfolioId: string;
    cashAccount: { id: string; currency: string };
    amount: number;
    executedAt: Date;
    parentTxId: string;
    note: string;
  },
) {
  const { portfolioId, cashAccount, amount } = params;

  const deposit = await tx.transaction.create({
    data: {
      portfolioId,
      type: "DEPOSIT",
      baseCurrAmount: amount,
      executedAt: params.executedAt,
      parentTxId: params.parentTxId,
      metadata: { currency: cashAccount.currency, direction: "IN", note: params.note },
    },
  });

  await postLedgerEntries(tx, deposit.id, [
    {
      portfolioId,
      accountType: "CASH",
      side: "DEBIT",
      amount,
      assetSymbol: cashAccount.currency,
      cashAccountId: cashAccount.id,
    },
    {
      portfolioId,
      accountType: "EQUITY",
      side: "CREDIT",
      amount,
      assetSymbol: cashAccount.currency,
    },
  ]);
}

/**
 * Re-reads the balance AFTER the ledger posting, inside the same DB transaction.
 * The increment in postLedgerEntries() takes a row lock, so a concurrent posting on
 * the same account waits for ours to commit and then sees the reduced balance — a
 * check-before-write alone would let two concurrent withdrawals both pass.
 */
async function assertCashNotNegative(
  tx: LedgerTxClient,
  cashAccountId: string,
  allowNegative: boolean,
) {
  if (allowNegative) return;

  const account = await tx.cashAccount.findUniqueOrThrow({
    where: { id: cashAccountId },
  });

  if (Number(account.balance) < -0.000001) {
    throw AppError.badRequest(
      `Insufficient ${account.currency} cash balance for this transaction`,
    );
  }
}

function assertNonNegative(value: number | undefined, field: string) {
  if (value != null && value < 0) {
    throw AppError.badRequest(`${field} cannot be negative`);
  }
}

/**
 * BUY
 *
 * Accounting:
 *
 * CASH   CREDIT  totalCost
 * ASSET  DEBIT   totalCost
 *
 * Plus:
 * - update Position
 * - create TaxLot
 */
async function createBuyTransaction(
  portfolio: Portfolio,
  input: CreateTransactionInput,
) {
  const { portfolioId, assetId, quantity, price, fee = 0 } = input;

  if (!assetId || quantity == null || price == null) {
    throw AppError.badRequest("BUY requires assetId, quantity, and price");
  }

  if (quantity <= 0 || price <= 0) {
    throw AppError.badRequest("quantity and price must be positive");
  }

  assertNonNegative(fee, "fee");

  const executedAt = input.executedAt ?? new Date();

  // Rate at purchase is stored on the lot so a later SELL can split FX from stock P/L.
  // Fetched before the DB transaction — never hold row locks across a network call.
  const assetForFx = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!assetForFx) {
    throw AppError.notFound("Asset not found");
  }
  const purchaseFxRate = await resolveHomeFxRate(
    portfolio,
    input.currency ?? assetForFx.currency,
    executedAt,
  );

  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw AppError.notFound("Asset not found");

    const currency = input.currency ?? asset.currency;
    const cashAccount = input.fundWithDeposit
      ? await getOrCreateCashAccount(tx, portfolioId, currency)
      : await getCashAccount(tx, portfolioId, currency);

    const totalCost = quantity * price + fee;

    const effectiveUnitCost = totalCost / quantity;

    const transaction = await tx.transaction.create({
      data: {
        portfolioId,
        type: "BUY",
        mainAssetId: assetId,
        mainQuantity: quantity,
        mainPrice: price,
        baseCurrAmount: totalCost,
        exchangeRate: purchaseFxRate,
        fee,
        executedAt,
        externalRef: input.externalRef,
        metadata: { currency: cashAccount.currency, note: input.note, timeKnown: input.timeKnown },
      },
    });

    if (input.fundWithDeposit) {
      await postFundingDeposit(tx, {
        portfolioId,
        cashAccount,
        amount: totalCost,
        executedAt,
        parentTxId: transaction.id,
        note: `Funding for BUY ${asset.symbol}`,
      });
    }

    const entries: LedgerEntryInput[] = [
      {
        portfolioId,
        accountType: "CASH",
        side: "CREDIT",
        amount: totalCost,
        assetSymbol: cashAccount.currency,
        cashAccountId: cashAccount.id,
      },
      {
        portfolioId,
        accountType: "ASSET",
        side: "DEBIT",
        amount: totalCost,
        assetSymbol: asset.symbol,
        assetId,
      },
    ];

    await postLedgerEntries(tx, transaction.id, entries);
    await assertCashNotNegative(tx, cashAccount.id, portfolio.isMargin);

    const existingPosition = await tx.position.findUnique({
      where: {
        portfolioId_assetId: {
          portfolioId,
          assetId,
        },
      },
    });

    if (existingPosition) {
      const oldQty = Number(existingPosition.quantity);

      const oldAvg = Number(existingPosition.avgPrice);

      const newQty = oldQty + quantity;

      const newAvg = (oldQty * oldAvg + quantity * effectiveUnitCost) / newQty;

      await tx.position.update({
        where: {
          id: existingPosition.id,
        },
        data: {
          quantity: newQty,
          avgPrice: newAvg,
        },
      });
    } else {
      await tx.position.create({
        data: {
          portfolioId,
          assetId,
          quantity,
          avgPrice: effectiveUnitCost,
        },
      });
    }

    await tx.taxLot.create({
      data: {
        portfolioId,
        assetId,
        transactionId: transaction.id,
        remainingQty: quantity,
        purchasePrice: effectiveUnitCost,
        purchaseFxRate,
        earnedYear: executedAt.getFullYear(),
        executedAt,
      },
    });

    return transaction;
  });
}

/**
 * SELL
 *
 * Accounting (the ASSET account is relieved at COST, the difference is P/L):
 *
 * CASH   DEBIT   netCashIn
 * ASSET  CREDIT  costBasisRemoved
 * EQUITY CREDIT  realizedPL      (gain)   — or EQUITY DEBIT |realizedPL| on a loss
 *
 * Plus:
 * - FIFO TaxLot consumption
 * - update Position
 * - calculate realizedPL, and split it (in THB) into stock-price vs FX components
 *   using each consumed lot's purchase rate and the rate at sale (see fx-pl.ts)
 * - CAPITAL_GAIN TaxRecord when there's a gain in a REAL portfolio
 */
async function createSellTransaction(
  portfolio: Portfolio,
  input: CreateTransactionInput,
) {
  const { portfolioId, assetId, quantity, price, fee = 0 } = input;

  if (!assetId || quantity == null || price == null) {
    throw AppError.badRequest("SELL requires assetId, quantity, and price");
  }

  if (quantity <= 0 || price <= 0) {
    throw AppError.badRequest("quantity and price must be positive");
  }

  assertNonNegative(fee, "fee");

  const executedAt = input.executedAt ?? new Date();

  const assetForFx = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!assetForFx) {
    throw AppError.notFound("Asset not found");
  }
  const sellCurrency = input.currency ?? assetForFx.currency;
  const sellFxRate = await resolveHomeFxRate(portfolio, sellCurrency, executedAt);
  const taxFxRate = portfolio.type === "REAL" ? sellFxRate : null;
  const missingLotRates = await resolveMissingLotFxRates(
    portfolio,
    portfolioId,
    assetId,
    sellCurrency,
  );

  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw AppError.notFound("Asset not found");

    const position = await tx.position.findUnique({
      where: {
        portfolioId_assetId: {
          portfolioId,
          assetId,
        },
      },
    });

    if (!position || Number(position.quantity) < quantity) {
      throw AppError.badRequest(
        "Not enough shares in this position to sell that quantity",
      );
    }

    const cashAccount = await getCashAccount(
      tx,
      portfolioId,
      input.currency ?? asset.currency,
    );

    const grossProceeds = quantity * price;

    const netCashIn = grossProceeds - fee;

    if (netCashIn < 0) {
      throw AppError.badRequest("Fee cannot exceed gross proceeds");
    }

    /**
     * FIFO
     */
    const openLots = await tx.taxLot.findMany({
      where: {
        portfolioId,
        assetId,
        remainingQty: {
          gt: 0,
        },
      },
      orderBy: {
        executedAt: "asc",
      },
    });

    const openLotsCost = openLots.reduce(
      (sum, lot) => sum + Number(lot.remainingQty) * Number(lot.purchasePrice),
      0,
    );

    let remainingToSell = quantity;
    let costBasisRemoved = 0;
    const consumedLots: FxLot[] = [];
    let allLotRatesKnown = true;

    for (const lot of openLots) {
      if (remainingToSell <= 0) {
        break;
      }

      const lotRemaining = Number(lot.remainingQty);

      const consumeQty = Math.min(lotRemaining, remainingToSell);

      const lotFxRate =
        lot.purchaseFxRate != null
          ? Number(lot.purchaseFxRate)
          : (missingLotRates.get(lot.id) ?? null);

      await tx.taxLot.update({
        where: {
          id: lot.id,
        },
        data: {
          remainingQty: lotRemaining - consumeQty,
          // Legacy lots (before rates were recorded) get theirs filled in on first sale.
          ...(lot.purchaseFxRate == null && lotFxRate != null
            ? { purchaseFxRate: lotFxRate }
            : {}),
        },
      });

      costBasisRemoved += consumeQty * Number(lot.purchasePrice);

      if (lotFxRate == null) {
        allLotRatesKnown = false;
      } else {
        consumedLots.push({
          quantity: consumeQty,
          unitCost: Number(lot.purchasePrice),
          fxRate: lotFxRate,
        });
      }

      remainingToSell -= consumeQty;
    }

    if (remainingToSell > 1e-8) {
      throw AppError.conflict(
        "Open tax lots do not cover the position quantity — data inconsistency",
      );
    }

    const realizedPL = netCashIn - costBasisRemoved;

    // FIFO removed specific lots, so the new average is the remaining lots' cost —
    // keeps avgPrice in line with the ASSET ledger balance and realizedPL.
    const newQuantity = Number(position.quantity) - quantity;
    const newAvgPrice =
      newQuantity > 1e-8 ? (openLotsCost - costBasisRemoved) / newQuantity : 0;

    // Null when any rate is missing (only possible for PAPER) — no partial splits.
    const fxSplit =
      sellFxRate != null && allLotRatesKnown
        ? splitPL(consumedLots, netCashIn, sellFxRate)
        : null;

    const transaction = await tx.transaction.create({
      data: {
        portfolioId,
        type: "SELL",
        mainAssetId: assetId,
        mainQuantity: quantity,
        mainPrice: price,
        baseCurrAmount: netCashIn,
        exchangeRate: sellFxRate,
        fee,
        executedAt,
        externalRef: input.externalRef,
        metadata: {
          currency: cashAccount.currency,
          costBasis: costBasisRemoved,
          realizedPL,
          ...(fxSplit
            ? {
                homeCurrency: TAX_CURRENCY,
                costBasisHome: fxSplit.costBasisHome,
                proceedsHome: fxSplit.valueHome,
                realizedPLHome: fxSplit.plHome,
                realizedStockPLHome: fxSplit.stockPLHome,
                realizedFxPLHome: fxSplit.fxPLHome,
              }
            : {}),
          note: input.note,
          timeKnown: input.timeKnown,
        },
      },
    });

    const entries: LedgerEntryInput[] = [];

    if (netCashIn > 0) {
      entries.push({
        portfolioId,
        accountType: "CASH",
        side: "DEBIT",
        amount: netCashIn,
        assetSymbol: cashAccount.currency,
        cashAccountId: cashAccount.id,
      });
    }

    if (costBasisRemoved > 0) {
      entries.push({
        portfolioId,
        accountType: "ASSET",
        side: "CREDIT",
        amount: costBasisRemoved,
        assetSymbol: asset.symbol,
        assetId,
      });
    }

    if (Math.abs(realizedPL) > 1e-9) {
      entries.push({
        portfolioId,
        accountType: "EQUITY",
        side: realizedPL > 0 ? "CREDIT" : "DEBIT",
        amount: Math.abs(realizedPL),
        assetSymbol: asset.symbol,
      });
    }

    if (entries.length > 0) {
      await postLedgerEntries(tx, transaction.id, entries);
    }

    await tx.position.update({
      where: {
        id: position.id,
      },
      data: {
        quantity: newQuantity,

        avgPrice: newAvgPrice,

        realizedPL: Number(position.realizedPL) + realizedPL,

        ...(fxSplit
          ? {
              realizedPLHome: { increment: fxSplit.plHome },
              realizedStockPLHome: { increment: fxSplit.stockPLHome },
              realizedFxPLHome: { increment: fxSplit.fxPLHome },
            }
          : {}),
      },
    });

    if (taxFxRate != null && realizedPL > 0) {
      await recordTax(tx, {
        transactionId: transaction.id,
        portfolioId,
        taxType: "CAPITAL_GAIN",
        sourceCountry: input.sourceCountry ?? sourceCountryOf(asset),
        incomeAmount: realizedPL,
        fxRate: taxFxRate,
        executedAt,
      });
    }

    return transaction;
  });
}

/**
 * Purchase rates for open lots recorded before rates were stored. Looked up BEFORE the
 * sell's DB transaction (network call), keyed by lot id.
 */
async function resolveMissingLotFxRates(
  portfolio: Portfolio,
  portfolioId: string,
  assetId: string,
  currency: string,
): Promise<Map<string, number>> {
  const lots = await prisma.taxLot.findMany({
    where: { portfolioId, assetId, remainingQty: { gt: 0 }, purchaseFxRate: null },
  });

  const rates = new Map<string, number>();
  for (const lot of lots) {
    const rate = await resolveHomeFxRate(portfolio, currency, lot.executedAt);
    if (rate != null) rates.set(lot.id, rate);
  }
  return rates;
}

type CashMovementType = "DEPOSIT" | "WITHDRAW" | "FEE" | "TAX" | "ADJUSTMENT";

/**
 * DEPOSIT / WITHDRAW / FEE / TAX / ADJUSTMENT — cash against EQUITY.
 *
 * Money in  (DEPOSIT, ADJUSTMENT +):          CASH DEBIT,  EQUITY CREDIT
 * Money out (WITHDRAW, FEE, TAX, ADJUSTMENT −): CASH CREDIT, EQUITY DEBIT
 *
 * FEE covers account-level charges (custody, platform fee) — trade commissions go in
 * the `fee` field of BUY/SELL instead so they land in cost basis.
 */
async function createCashMovement(
  input: CreateTransactionInput,
  type: CashMovementType,
) {
  const { portfolioId, amount, currency } = input;

  if (amount == null || amount === 0 || (type !== "ADJUSTMENT" && amount < 0)) {
    throw AppError.badRequest(
      type === "ADJUSTMENT"
        ? "ADJUSTMENT requires a non-zero amount (negative to reduce cash)"
        : `${type} requires a positive amount`,
    );
  }

  if (!currency) {
    throw AppError.badRequest(
      `${type} requires a currency (which CashAccount to use)`,
    );
  }

  const isInflow = type === "DEPOSIT" || (type === "ADJUSTMENT" && amount > 0);
  const absAmount = Math.abs(amount);

  return prisma.$transaction(async (tx) => {
    const cashAccount = await getCashAccount(tx, portfolioId, currency);

    const transaction = await tx.transaction.create({
      data: {
        portfolioId,
        type,
        baseCurrAmount: absAmount,
        executedAt: input.executedAt ?? new Date(),
        externalRef: input.externalRef,
        metadata: {
          currency,
          direction: isInflow ? "IN" : "OUT",
          note: input.note,
          timeKnown: input.timeKnown,
        },
      },
    });

    const entries: LedgerEntryInput[] = [
      {
        portfolioId,
        accountType: "CASH",
        side: isInflow ? "DEBIT" : "CREDIT",
        amount: absAmount,
        assetSymbol: currency,
        cashAccountId: cashAccount.id,
      },
      {
        portfolioId,
        accountType: "EQUITY",
        side: isInflow ? "CREDIT" : "DEBIT",
        amount: absAmount,
        assetSymbol: currency,
      },
    ];

    await postLedgerEntries(tx, transaction.id, entries);
    await assertCashNotNegative(tx, cashAccount.id, false);

    return transaction;
  });
}

/**
 * DIVIDEND
 *
 * CASH   DEBIT   amount (net received)
 * EQUITY CREDIT  amount
 *
 * Also increments Position.totalDiv and, for REAL portfolios, writes a TaxRecord on
 * the GROSS dividend (net + taxWithheld) — WITHHOLDING if tax was withheld at source.
 */
async function createDividendTransaction(
  portfolio: Portfolio,
  input: CreateTransactionInput,
) {
  const { portfolioId, assetId, amount, currency, taxWithheld = 0 } = input;

  if (!assetId || amount == null || amount <= 0) {
    throw AppError.badRequest(
      "DIVIDEND requires assetId and a positive amount",
    );
  }

  if (!currency) {
    throw AppError.badRequest(
      "DIVIDEND requires a currency (which CashAccount to use)",
    );
  }

  assertNonNegative(taxWithheld, "taxWithheld");

  const executedAt = input.executedAt ?? new Date();
  const taxFxRate = await resolveTaxFxRate(portfolio, currency, executedAt);

  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({
      where: {
        id: assetId,
      },
    });

    if (!asset) {
      throw AppError.notFound("Asset not found");
    }

    const position = await tx.position.findUnique({
      where: {
        portfolioId_assetId: {
          portfolioId,
          assetId,
        },
      },
    });

    if (!position) {
      throw AppError.badRequest(
        "No open position in this asset to record a dividend against",
      );
    }

    const cashAccount = await getCashAccount(tx, portfolioId, currency);

    const transaction = await tx.transaction.create({
      data: {
        portfolioId,
        type: "DIVIDEND",
        mainAssetId: assetId,
        baseCurrAmount: amount,
        taxWithheld,
        executedAt,
        externalRef: input.externalRef,
        metadata: { currency, grossAmount: amount + taxWithheld, note: input.note, timeKnown: input.timeKnown },
      },
    });

    const entries: LedgerEntryInput[] = [
      {
        portfolioId,
        accountType: "CASH",
        side: "DEBIT",
        amount,
        assetSymbol: currency,
        cashAccountId: cashAccount.id,
      },
      {
        portfolioId,
        accountType: "EQUITY",
        side: "CREDIT",
        amount,
        assetSymbol: asset.symbol,
      },
    ];

    await postLedgerEntries(tx, transaction.id, entries);

    await tx.position.update({
      where: {
        id: position.id,
      },
      data: {
        totalDiv: Number(position.totalDiv) + amount,
      },
    });

    if (taxFxRate != null) {
      await recordTax(tx, {
        transactionId: transaction.id,
        portfolioId,
        taxType: taxWithheld > 0 ? "WITHHOLDING" : "PERSONAL_INCOME",
        sourceCountry: input.sourceCountry ?? sourceCountryOf(asset),
        incomeAmount: amount + taxWithheld,
        fxRate: taxFxRate,
        executedAt,
      });
    }

    return transaction;
  });
}

/**
 * SPLIT — no money moves, so no ledger entries. Quantity is multiplied by `ratio` and
 * per-unit cost divided by it, on both the Position and every open TaxLot, so total
 * cost basis (and future FIFO results) stay exactly the same.
 */
async function createSplitTransaction(input: CreateTransactionInput) {
  const { portfolioId, assetId } = input;
  const ratio = input.ratio ?? input.quantity;

  if (!assetId || ratio == null || ratio <= 0 || ratio === 1) {
    throw AppError.badRequest(
      "SPLIT requires assetId and a positive ratio other than 1 (e.g. 2 for 2-for-1, 0.1 for 1-for-10)",
    );
  }

  return prisma.$transaction(async (tx) => {
    const position = await tx.position.findUnique({
      where: { portfolioId_assetId: { portfolioId, assetId } },
    });

    if (!position || Number(position.quantity) <= 0) {
      throw AppError.badRequest("No open position in this asset to split");
    }

    const transaction = await tx.transaction.create({
      data: {
        portfolioId,
        type: "SPLIT",
        mainAssetId: assetId,
        mainQuantity: Number(position.quantity) * ratio,
        executedAt: input.executedAt ?? new Date(),
        metadata: {
          ratio,
          quantityBefore: Number(position.quantity),
          avgPriceBefore: Number(position.avgPrice),
          note: input.note,
        },
      },
    });

    await tx.position.update({
      where: { id: position.id },
      data: {
        quantity: Number(position.quantity) * ratio,
        avgPrice: Number(position.avgPrice) / ratio,
      },
    });

    const openLots = await tx.taxLot.findMany({
      where: { portfolioId, assetId, remainingQty: { gt: 0 } },
    });

    for (const lot of openLots) {
      await tx.taxLot.update({
        where: { id: lot.id },
        data: {
          remainingQty: Number(lot.remainingQty) * ratio,
          purchasePrice: Number(lot.purchasePrice) / ratio,
        },
      });
    }

    return transaction;
  });
}

/**
 * REPATRIATION — converts foreign cash (non-domestic account) into the portfolio's
 * domestic THB account. Each side is balanced against EQUITY in its own currency,
 * since a single debit/credit pair can't balance across two currencies:
 *
 * CASH (foreign)  CREDIT  amount         EQUITY DEBIT  amount
 * CASH (THB dom.) DEBIT   amount × rate  EQUITY CREDIT amount × rate
 */
async function createRepatriationTransaction(input: CreateTransactionInput) {
  const { portfolioId, amount, currency } = input;

  if (amount == null || amount <= 0 || !currency) {
    throw AppError.badRequest(
      "REPATRIATION requires a positive amount and the foreign currency it's in",
    );
  }

  if (currency.toUpperCase() === TAX_CURRENCY) {
    throw AppError.badRequest("REPATRIATION is for foreign-currency cash only");
  }

  const executedAt = input.executedAt ?? new Date();
  const rate =
    input.price != null && input.price > 0
      ? input.price
      : await getExchangeRate(currency, TAX_CURRENCY, executedAt);

  const targetAmount = Math.round(amount * rate * 100) / 100;
  const fee = input.fee ?? 0;
  assertNonNegative(fee, "fee");
  const netTarget = targetAmount - fee;

  if (netTarget <= 0) {
    throw AppError.badRequest("Fee cannot exceed the converted amount");
  }

  return prisma.$transaction(async (tx) => {
    const source = await getCashAccount(tx, portfolioId, currency, false);
    const target = await getCashAccount(tx, portfolioId, TAX_CURRENCY, true);

    const transaction = await tx.transaction.create({
      data: {
        portfolioId,
        type: "REPATRIATION",
        baseCurrAmount: netTarget,
        exchangeRate: rate,
        fee,
        executedAt,
        externalRef: input.externalRef,
        metadata: {
          currency: TAX_CURRENCY,
          sourceCurrency: currency,
          sourceAmount: amount,
          targetAmount: netTarget,
          note: input.note,
          timeKnown: input.timeKnown,
        },
      },
    });

    await postLedgerEntries(tx, transaction.id, [
      {
        portfolioId,
        accountType: "CASH",
        side: "CREDIT",
        amount,
        assetSymbol: currency,
        cashAccountId: source.id,
      },
      {
        portfolioId,
        accountType: "EQUITY",
        side: "DEBIT",
        amount,
        assetSymbol: currency,
      },
    ]);

    await postLedgerEntries(tx, transaction.id, [
      {
        portfolioId,
        accountType: "CASH",
        side: "DEBIT",
        amount: netTarget,
        assetSymbol: TAX_CURRENCY,
        cashAccountId: target.id,
      },
      {
        portfolioId,
        accountType: "EQUITY",
        side: "CREDIT",
        amount: netTarget,
        assetSymbol: TAX_CURRENCY,
      },
    ]);

    await assertCashNotNegative(tx, source.id, false);

    return transaction;
  });
}

export async function getTransactionById(userId: string, id: string) {
  const transaction = await prisma.transaction.findUnique({
    where: {
      id,
    },
  });

  if (!transaction) {
    throw AppError.notFound("Transaction not found");
  }

  await assertPortfolioOwnership(userId, transaction.portfolioId);

  return transaction;
}

export async function listTransactions(
  userId: string,
  portfolioId: string,
  filters: {
    type?: TransactionTypeValue;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  },
) {
  await assertPortfolioOwnership(userId, portfolioId);

  const transactions = await prisma.transaction.findMany({
    where: {
      portfolioId,
      type: filters.type,
      executedAt: {
        gte: filters.from,
        lte: filters.to,
      },
    },
    orderBy: {
      executedAt: "desc",
    },
    take: Math.min(filters.limit ?? 50, 200),
    skip: filters.offset ?? 0,
    include: { slipVerification: { select: { id: true } } },
  });

  // Preloaded here so the list's assetSymbol/hasSlip fields don't query per row.
  const assetIds = [...new Set(transactions.flatMap((t) => (t.mainAssetId ? [t.mainAssetId] : [])))];
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true, symbol: true },
  });
  const symbolById = new Map(assets.map((a) => [a.id, a.symbol]));

  return transactions.map((t) => ({
    ...t,
    assetSymbol: t.mainAssetId ? (symbolById.get(t.mainAssetId) ?? null) : null,
  }));
}

export async function listPositions(userId: string, portfolioId: string) {
  await assertPortfolioOwnership(userId, portfolioId);

  return prisma.position.findMany({
    where: {
      portfolioId,
    },
  });
}

export async function getPosition(
  userId: string,
  portfolioId: string,
  assetId: string,
) {
  await assertPortfolioOwnership(userId, portfolioId);

  const position = await prisma.position.findUnique({
    where: {
      portfolioId_assetId: {
        portfolioId,
        assetId,
      },
    },
  });

  if (!position) {
    throw AppError.notFound("Position not found");
  }

  return position;
}
