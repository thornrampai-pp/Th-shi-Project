/**
 * Pure reconstruction of positions at any point in time from the transaction log.
 * Mirrors the accounting in transaction.service.ts (weighted-average cost incl. fees on
 * BUY, FIFO lot consumption + realizedPL on SELL, ratio scaling on SPLIT), so a
 * snapshot for a past date sees the portfolio exactly as it was that day — the
 * Position table only ever holds the current state.
 */

export interface ReplayTransaction {
  type: string;
  executedAt: Date;
  createdAt: Date;
  mainAssetId: string | null;
  mainQuantity: number | null;
  mainPrice: number | null;
  fee: number;
  baseCurrAmount: number | null;
  metadata: unknown;
}

export interface ReplayLot {
  quantity: number;
  unitCost: number;
  executedAt: Date;
}

export interface ReplayedPosition {
  assetId: string;
  quantity: number;
  avgPrice: number;
  realizedPL: number;
  totalDiv: number;
  lots: ReplayLot[];
}

const EPSILON = 1e-9;

/** Chronological order; createdAt breaks ties between transactions with the same executedAt. */
export function sortForReplay<T extends Pick<ReplayTransaction, 'executedAt' | 'createdAt'>>(txs: T[]): T[] {
  return [...txs].sort(
    (a, b) => a.executedAt.getTime() - b.executedAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export function replayPositions(transactions: ReplayTransaction[], asOf: Date): Map<string, ReplayedPosition> {
  const positions = new Map<string, ReplayedPosition>();

  const get = (assetId: string) => {
    let position = positions.get(assetId);
    if (!position) {
      position = { assetId, quantity: 0, avgPrice: 0, realizedPL: 0, totalDiv: 0, lots: [] };
      positions.set(assetId, position);
    }
    return position;
  };

  for (const tx of sortForReplay(transactions)) {
    if (tx.executedAt.getTime() > asOf.getTime() || !tx.mainAssetId) continue;
    const position = get(tx.mainAssetId);
    const quantity = tx.mainQuantity ?? 0;
    const price = tx.mainPrice ?? 0;

    switch (tx.type) {
      case 'BUY': {
        if (quantity <= 0) break;
        const unitCost = (quantity * price + tx.fee) / quantity;
        const newQuantity = position.quantity + quantity;
        position.avgPrice = (position.quantity * position.avgPrice + quantity * unitCost) / newQuantity;
        position.quantity = newQuantity;
        position.lots.push({ quantity, unitCost, executedAt: tx.executedAt });
        // Keep lots FIFO-ordered by purchase date, like the TaxLot query in SELL does.
        position.lots.sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime());
        break;
      }

      case 'SELL': {
        if (quantity <= 0) break;
        let remaining = quantity;
        let costRemoved = 0;
        for (const lot of position.lots) {
          if (remaining <= EPSILON) break;
          const take = Math.min(lot.quantity, remaining);
          lot.quantity -= take;
          costRemoved += take * lot.unitCost;
          remaining -= take;
        }
        position.lots = position.lots.filter((lot) => lot.quantity > EPSILON);
        position.realizedPL += quantity * price - tx.fee - costRemoved;
        position.quantity = Math.max(0, position.quantity - quantity);
        // FIFO removed specific lots, so the average of what's left is the remaining
        // lots' cost — keeping the old average would mismatch realizedPL and overstate P/L.
        position.avgPrice = remainingAvgCost(position.lots, position.quantity);
        break;
      }

      case 'DIVIDEND':
        position.totalDiv += tx.baseCurrAmount ?? 0;
        break;

      case 'SPLIT': {
        const ratio = splitRatioOf(tx, position.quantity);
        if (ratio == null) break;
        position.quantity *= ratio;
        position.avgPrice /= ratio;
        for (const lot of position.lots) {
          lot.quantity *= ratio;
          lot.unitCost /= ratio;
        }
        break;
      }
    }
  }

  return positions;
}

function remainingAvgCost(lots: ReplayLot[], quantity: number): number {
  if (quantity <= EPSILON) return 0;
  return lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0) / quantity;
}

function splitRatioOf(tx: ReplayTransaction, quantityBefore: number): number | null {
  const meta = (tx.metadata ?? {}) as { ratio?: unknown };
  if (typeof meta.ratio === 'number' && meta.ratio > 0) return meta.ratio;
  // SPLIT stores the post-split quantity in mainQuantity — derive the ratio from it.
  if (tx.mainQuantity != null && quantityBefore > 0) return tx.mainQuantity / quantityBefore;
  return null;
}
