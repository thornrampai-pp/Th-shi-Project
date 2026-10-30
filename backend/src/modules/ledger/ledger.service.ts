import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/AppError";
import { assertPortfolioOwnership } from "../../common/utils/portfolio-ownership.util";

export type AccountTypeValue = "CASH" | "ASSET" | "EQUITY";
export type EntrySideValue = "DEBIT" | "CREDIT";

export interface LedgerEntryInput {
  portfolioId: string;
  accountType: AccountTypeValue;
  side: EntrySideValue;
  amount: number;
  assetSymbol: string;
  cashAccountId?: string;
  positionId?: string;
  assetId?: string;
}

/**
 * Prisma transaction client type.
 *
 * This is inferred directly from prisma.$transaction(),
 * so we don't need to manually maintain a fake Prisma client type.
 */
export type LedgerTxClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

/**
 * The ONE place ledger entries are written.
 *
 * IMPORTANT:
 * This function does NOT create its own transaction.
 * The caller owns the transaction boundary.
 *
 * Example:
 *
 * prisma.$transaction(async (tx) => {
 *   const transaction = await tx.transaction.create(...);
 *   await postLedgerEntries(tx, transaction.id, entries);
 *   await tx.position.update(...);
 * });
 *
 * This guarantees that Transaction + Ledger + Position
 * can commit or rollback together.
 */
export async function postLedgerEntries(
  tx: LedgerTxClient,
  transactionId: string,
  entries: LedgerEntryInput[],
) {
  if (entries.length === 0) {
    throw AppError.badRequest(
      "A ledger posting must contain at least one entry",
    );
  }

  for (const entry of entries) {
    if (!Number.isFinite(entry.amount) || entry.amount <= 0) {
      throw AppError.badRequest(
        "Ledger entry amounts must be positive — direction comes from `side`, not sign",
      );
    }

    if (entry.accountType === "CASH" && !entry.cashAccountId) {
      throw AppError.badRequest(
        "CASH ledger entries must include cashAccountId",
      );
    }

    if (entry.accountType === "ASSET" && !entry.assetId) {
      throw AppError.badRequest("ASSET ledger entries must include assetId");
    }

    // EQUITY entries don't require cashAccountId or assetId.
  }

  const totalDebit = sumBySide(entries, "DEBIT");
  const totalCredit = sumBySide(entries, "CREDIT");

  // Compare integer cents instead of raw floating point numbers.
  if (toCents(totalDebit) !== toCents(totalCredit)) {
    throw AppError.badRequest(
      `Ledger entries do not balance: debit ${totalDebit} !== credit ${totalCredit}`,
    );
  }

  const created = await Promise.all(
    entries.map((entry) =>
      tx.ledgerEntry.create({
        data: {
          transactionId,
          portfolioId: entry.portfolioId,
          accountType: entry.accountType,
          side: entry.side,
          amount: entry.amount,
          assetSymbol: entry.assetSymbol,
          cashAccountId: entry.cashAccountId,
          positionId: entry.positionId,
          assetId: entry.assetId,
        },
      }),
    ),
  );

  /**
   * CashAccount maintains a running balance.
   *
   * DEBIT  = money enters cash account
   * CREDIT = money leaves cash account
   */
  const cashEntries = entries.filter((entry) => entry.accountType === "CASH");

  for (const entry of cashEntries) {
    const signedAmount = entry.side === "DEBIT" ? entry.amount : -entry.amount;

    await tx.cashAccount.update({
      where: {
        id: entry.cashAccountId!,
      },
      data: {
        balance: {
          increment: signedAmount,
        },
      },
    });
  }

  return created;
}

export async function getLedgerEntries(
  userId: string,
  portfolioId: string,
  filters: {
    from?: Date;
    to?: Date;
    accountType?: AccountTypeValue;
    limit?: number;
    offset?: number;
  },
) {
  await assertPortfolioOwnership(userId, portfolioId);

  return prisma.ledgerEntry.findMany({
    where: {
      portfolioId,
      accountType: filters.accountType,
      createdAt: {
        gte: filters.from,
        lte: filters.to,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: Math.min(filters.limit ?? 50, 200),
    skip: filters.offset ?? 0,
  });
}

function sumBySide(entries: LedgerEntryInput[], side: EntrySideValue): number {
  return entries
    .filter((entry) => entry.side === side)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}
