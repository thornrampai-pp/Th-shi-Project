// Moves a holding from one of the user's portfolios to another. This is NOT a sale —
// no cash changes hands and nothing is realized. Each open tax lot that's moved keeps
// its own original purchase price, FX rate and date, so a later SELL in the destination
// portfolio still computes the correct FIFO cost basis and holding period.
//
// Recorded as two linked transactions (one per portfolio, since Transaction.portfolioId
// is single-valued) inside one DB transaction so both sides commit together:
//   Source      TRANSFER_OUT   ASSET CREDIT / EQUITY DEBIT   (removes cost basis)
//   Destination TRANSFER_IN    ASSET DEBIT  / EQUITY CREDIT  (adds the same cost basis)
import { prisma } from '../../config/prisma';
import { AppError } from '../../common/errors/AppError';
import { assertPortfolioOwnership } from '../../common/utils/portfolio-ownership.util';
import { postLedgerEntries } from '../ledger/ledger.service';
import type { LedgerEntryInput } from '../ledger/ledger.service';
import { logAuditEvent } from '../audit/audit.service';
import { refreshHistoryAfterTransaction } from '../history/history.service';

export interface TransferAssetInput {
  fromPortfolioId: string;
  toPortfolioId: string;
  assetId: string;
  quantity: number;
  executedAt?: Date;
  note?: string;
}

export async function transferAsset(userId: string, input: TransferAssetInput) {
  const { fromPortfolioId, toPortfolioId, assetId, quantity } = input;

  if (fromPortfolioId === toPortfolioId) {
    throw AppError.badRequest('Source and destination portfolios must be different');
  }
  if (!(quantity > 0)) {
    throw AppError.badRequest('quantity must be positive');
  }

  await assertPortfolioOwnership(userId, fromPortfolioId);
  await assertPortfolioOwnership(userId, toPortfolioId);

  const executedAt = input.executedAt ?? new Date();

  const result = await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw AppError.notFound('Asset not found');

    const sourcePosition = await tx.position.findUnique({
      where: { portfolioId_assetId: { portfolioId: fromPortfolioId, assetId } },
    });
    if (!sourcePosition || Number(sourcePosition.quantity) < quantity) {
      throw AppError.badRequest('Not enough shares in the source portfolio to transfer that quantity');
    }

    // FIFO-consume the source's open lots — same ordering SELL uses — but nothing is
    // sold: each consumed fragment is recreated as its own lot in the destination,
    // keeping its original price/date/FX rate so cost basis and holding period survive.
    const openLots = await tx.taxLot.findMany({
      where: { portfolioId: fromPortfolioId, assetId, remainingQty: { gt: 0 } },
      orderBy: { executedAt: 'asc' },
    });

    const openLotsCost = openLots.reduce((sum, lot) => sum + Number(lot.remainingQty) * Number(lot.purchasePrice), 0);

    let remaining = quantity;
    let costBasisMoved = 0;
    const movedLots: { quantity: number; purchasePrice: number; purchaseFxRate: number | null; executedAt: Date }[] = [];

    for (const lot of openLots) {
      if (remaining <= 0) break;
      // Replaying the log (snapshots, holdings) would otherwise move shares that weren't owned yet.
      if (lot.executedAt.getTime() > executedAt.getTime()) {
        throw AppError.badRequest("Transfer date can't be before the shares being moved were bought");
      }
      const lotRemaining = Number(lot.remainingQty);
      const consumeQty = Math.min(lotRemaining, remaining);

      await tx.taxLot.update({ where: { id: lot.id }, data: { remainingQty: lotRemaining - consumeQty } });

      costBasisMoved += consumeQty * Number(lot.purchasePrice);
      movedLots.push({
        quantity: consumeQty,
        purchasePrice: Number(lot.purchasePrice),
        purchaseFxRate: lot.purchaseFxRate != null ? Number(lot.purchaseFxRate) : null,
        executedAt: lot.executedAt,
      });
      remaining -= consumeQty;
    }

    if (remaining > 1e-8) {
      throw AppError.conflict('Open tax lots do not cover the position quantity — data inconsistency');
    }

    // Amounts are cost basis in the asset's own currency (lot prices are).
    const outTx = await tx.transaction.create({
      data: {
        portfolioId: fromPortfolioId,
        type: 'TRANSFER_OUT',
        mainAssetId: assetId,
        mainQuantity: quantity,
        mainPrice: costBasisMoved / quantity,
        baseCurrAmount: costBasisMoved,
        executedAt,
        metadata: { currency: asset.currency, note: input.note, counterpartyPortfolioId: toPortfolioId },
      },
    });

    // The lots travel in the metadata: replaying the destination's log (holdings and
    // snapshots are rebuilt that way) has no access to the source portfolio's tax lots.
    const inTx = await tx.transaction.create({
      data: {
        portfolioId: toPortfolioId,
        type: 'TRANSFER_IN',
        mainAssetId: assetId,
        mainQuantity: quantity,
        mainPrice: costBasisMoved / quantity,
        baseCurrAmount: costBasisMoved,
        executedAt,
        parentTxId: outTx.id,
        metadata: {
          currency: asset.currency,
          note: input.note,
          counterpartyPortfolioId: fromPortfolioId,
          lots: movedLots.map((lot) => ({
            quantity: lot.quantity,
            unitCost: lot.purchasePrice,
            executedAt: lot.executedAt.toISOString(),
          })),
        },
      },
    });

    if (costBasisMoved > 0) {
      const outEntries: LedgerEntryInput[] = [
        { portfolioId: fromPortfolioId, accountType: 'ASSET', side: 'CREDIT', amount: costBasisMoved, assetSymbol: asset.symbol, assetId },
        { portfolioId: fromPortfolioId, accountType: 'EQUITY', side: 'DEBIT', amount: costBasisMoved, assetSymbol: asset.symbol },
      ];
      await postLedgerEntries(tx, outTx.id, outEntries);

      const inEntries: LedgerEntryInput[] = [
        { portfolioId: toPortfolioId, accountType: 'ASSET', side: 'DEBIT', amount: costBasisMoved, assetSymbol: asset.symbol, assetId },
        { portfolioId: toPortfolioId, accountType: 'EQUITY', side: 'CREDIT', amount: costBasisMoved, assetSymbol: asset.symbol },
      ];
      await postLedgerEntries(tx, inTx.id, inEntries);
    }

    // Source position — FIFO removed specific lots, so the new average is the
    // remaining lots' cost (same approach as SELL).
    const newSourceQty = Number(sourcePosition.quantity) - quantity;
    await tx.position.update({
      where: { id: sourcePosition.id },
      data: {
        quantity: newSourceQty,
        avgPrice: newSourceQty > 1e-8 ? (openLotsCost - costBasisMoved) / newSourceQty : 0,
      },
    });

    // Destination position — merge into an existing holding (weighted average, same as BUY) or create one.
    const destPosition = await tx.position.findUnique({
      where: { portfolioId_assetId: { portfolioId: toPortfolioId, assetId } },
    });
    if (destPosition) {
      const oldQty = Number(destPosition.quantity);
      const oldAvg = Number(destPosition.avgPrice);
      const newQty = oldQty + quantity;
      await tx.position.update({
        where: { id: destPosition.id },
        data: { quantity: newQty, avgPrice: (oldQty * oldAvg + costBasisMoved) / newQty },
      });
    } else {
      await tx.position.create({
        data: { portfolioId: toPortfolioId, assetId, quantity, avgPrice: costBasisMoved / quantity },
      });
    }

    for (const lot of movedLots) {
      await tx.taxLot.create({
        data: {
          portfolioId: toPortfolioId,
          assetId,
          transactionId: inTx.id,
          remainingQty: lot.quantity,
          purchasePrice: lot.purchasePrice,
          purchaseFxRate: lot.purchaseFxRate,
          earnedYear: lot.executedAt.getFullYear(),
          executedAt: lot.executedAt,
        },
      });
    }

    return { out: outTx, in: inTx };
  });

  // Both portfolios' value history changed from `executedAt` on. Never blocks the response.
  for (const portfolioId of [fromPortfolioId, toPortfolioId]) {
    refreshHistoryAfterTransaction(portfolioId, executedAt).catch((err) => {
      console.error('❌ Failed to refresh history after transfer:', err);
    });
  }

  logAuditEvent(userId, 'TRANSFER_ASSET', { fromPortfolioId, toPortfolioId, assetId, quantity }).catch((err) => {
    console.error('❌ Failed to write audit log for TRANSFER_ASSET:', err);
  });

  return result;
}
