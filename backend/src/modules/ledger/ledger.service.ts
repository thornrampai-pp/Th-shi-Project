import { prisma } from '../../config/prisma';
import { AppError } from '../../common/errors/AppError';
import { assertPortfolioOwnership } from '../../common/utils/portfolio-ownership.util';

export type AccountTypeValue = 'CASH' | 'ASSET';
export type EntrySideValue = 'DEBIT' | 'CREDIT';

export interface LedgerEntryInput {
  portfolioId: string;
  accountType: AccountTypeValue;
  side: EntrySideValue;
  amount: number; // always positive — direction comes from `side`, never from sign
  assetSymbol: string;
  cashAccountId?: string;
  positionId?: string;
  assetId?: string;
}

// Minimal shape this function needs from a Prisma transaction client — defined locally
// instead of importing Prisma.TransactionClient, so this file has no dependency on the
// generated client's exact export path.
export interface LedgerTxClient {
  ledgerEntry: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
  cashAccount: {
    update: (args: {
      where: { id: string };
      data: { balance: { increment: number } };
    }) => Promise<unknown>;
  };
}

/**
 * The ONE place money gets written in this system. Every batch must balance —
 * sum(DEBIT) === sum(CREDIT) — or nothing is written at all.
 *
 * Takes a transaction client rather than opening its own `prisma.$transaction`, so
 * callers (the Transaction service in Phase 5, Order fills in Phase 9) can compose
 * this together with their OWN writes — creating the Transaction row, updating
 * Position — as a single atomic unit. This function never commits on its own.
 */
export async function postLedgerEntries(
  tx: LedgerTxClient,
  transactionId: string,
  entries: LedgerEntryInput[],
) {
  if (entries.length === 0) {
    throw AppError.badRequest('A ledger posting must contain at least one entry');
  }

  for (const entry of entries) {
    if (entry.amount <= 0) {
      throw AppError.badRequest(
        'Ledger entry amounts must be positive — direction comes from `side`, not sign',
      );
    }
    if (entry.accountType === 'CASH' && !entry.cashAccountId) {
      throw AppError.badRequest('CASH ledger entries must include cashAccountId');
    }
    if (entry.accountType === 'ASSET' && !entry.assetId) {
      throw AppError.badRequest('ASSET ledger entries must include assetId');
    }
  }

  const totalDebit = sumBySide(entries, 'DEBIT');
  const totalCredit = sumBySide(entries, 'CREDIT');

  // Compare in integer cents — comparing raw floats (0.1 + 0.2 !== 0.3) would reject a
  // perfectly valid posting due to binary floating point rounding, not a real imbalance.
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

  // CashAccount carries a running balance — kept in sync in the SAME transaction as the
  // entries above. ASSET-side entries don't drive anything here; Position.quantity /
  // avgPrice is maintained separately by whichever service calls this function.
  const cashEntries = entries.filter((e) => e.accountType === 'CASH');
  for (const entry of cashEntries) {
    const signedAmount = entry.side === 'DEBIT' ? entry.amount : -entry.amount;
    await tx.cashAccount.update({
      where: { id: entry.cashAccountId! },
      data: { balance: { increment: signedAmount } },
    });
  }

  return created;
}

export async function getLedgerEntries(
  userId: string,
  portfolioId: string,
  filters: { from?: Date; to?: Date; accountType?: AccountTypeValue },
) {
  await assertPortfolioOwnership(userId, portfolioId);

  return prisma.ledgerEntry.findMany({
    where: {
      portfolioId,
      accountType: filters.accountType,
      createdAt: { gte: filters.from, lte: filters.to },
    },
    orderBy: { createdAt: 'desc' },
  });
}

function sumBySide(entries: LedgerEntryInput[], side: EntrySideValue): number {
  return entries.filter((e) => e.side === side).reduce((sum, e) => sum + e.amount, 0);
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}
