import { describe, it, expect } from 'vitest';
import { replayPositions, ReplayTransaction } from './replay';

let seq = 0;
function tx(
  partial: Partial<Omit<ReplayTransaction, 'executedAt'>> & { type: string; executedAt: string },
): ReplayTransaction {
  seq += 1;
  return {
    mainAssetId: 'PTT',
    mainQuantity: null,
    mainPrice: null,
    fee: 0,
    baseCurrAmount: null,
    metadata: null,
    ...partial,
    executedAt: new Date(partial.executedAt),
    createdAt: new Date(Date.UTC(2020, 0, 1) + seq),
  };
}

// Same sequence as prisma/seed.ts — must reproduce the README's expected figures.
const seedTxs = [
  tx({ type: 'BUY', executedAt: '2026-01-02', mainQuantity: 100, mainPrice: 35.5, fee: 20 }),
  tx({ type: 'BUY', executedAt: '2026-01-03', mainQuantity: 50, mainPrice: 36, fee: 15 }),
  tx({ type: 'SELL', executedAt: '2026-01-04', mainQuantity: 60, mainPrice: 37.2, fee: 25 }),
  tx({ type: 'DIVIDEND', executedAt: '2026-01-05', baseCurrAmount: 500 }),
];

describe('replayPositions', () => {
  it('reproduces the seed result (avg cost, FIFO realizedPL, dividends)', () => {
    const p = replayPositions(seedTxs, new Date('2026-12-31'))!.get('PTT')!;
    expect(p.quantity).toBe(90);
    // Remaining FIFO lots: 40 @ 35.70 + 50 @ 36.30 = 3,243 / 90
    expect(p.avgPrice).toBeCloseTo(3243 / 90, 6);
    expect(p.realizedPL).toBeCloseTo(65, 6);
    expect(p.totalDiv).toBe(500);
  });

  it('ignores transactions after asOf', () => {
    const p = replayPositions(seedTxs, new Date('2026-01-03T23:59:59Z')).get('PTT')!;
    expect(p.quantity).toBe(150);
    expect(p.realizedPL).toBe(0);
    expect(p.totalDiv).toBe(0);
  });

  it('consumes lots FIFO by purchase date even when recorded out of order', () => {
    const txs = [
      tx({ type: 'BUY', executedAt: '2026-02-10', mainQuantity: 10, mainPrice: 20 }),
      tx({ type: 'BUY', executedAt: '2026-02-01', mainQuantity: 10, mainPrice: 10 }), // backdated
      tx({ type: 'SELL', executedAt: '2026-02-20', mainQuantity: 10, mainPrice: 15 }),
    ];
    const p = replayPositions(txs, new Date('2026-03-01')).get('PTT')!;
    expect(p.realizedPL).toBeCloseTo(50, 6); // sold the 10 @ 10 lot first
    expect(p.lots).toHaveLength(1);
    expect(p.lots[0]!.unitCost).toBe(20);
  });

  it('re-derives avg cost from the remaining lots after a FIFO sell', () => {
    const txs = [
      tx({ type: 'BUY', executedAt: '2026-02-01', mainQuantity: 10, mainPrice: 10 }),
      tx({ type: 'BUY', executedAt: '2026-02-02', mainQuantity: 10, mainPrice: 20 }),
      tx({ type: 'SELL', executedAt: '2026-02-03', mainQuantity: 10, mainPrice: 20 }),
    ];
    const p = replayPositions(txs, new Date('2026-03-01')).get('PTT')!;
    expect(p.realizedPL).toBeCloseTo(100, 6);
    // Cost basis of what's left must be the 10 @ 20 lot, not the old 15 average —
    // otherwise realized (100) + unrealized at 20 (50) would overstate the 100 profit.
    expect(p.avgPrice).toBe(20);
    expect(p.quantity * p.avgPrice).toBe(200);
  });

  it('applies splits to quantity, avg price and lots, keeping cost basis', () => {
    const txs = [
      tx({ type: 'BUY', executedAt: '2026-03-01', mainQuantity: 10, mainPrice: 100 }),
      tx({ type: 'SPLIT', executedAt: '2026-03-02', mainQuantity: 20, metadata: { ratio: 2 } }),
      tx({ type: 'SELL', executedAt: '2026-03-03', mainQuantity: 5, mainPrice: 60 }),
    ];
    const p = replayPositions(txs, new Date('2026-04-01')).get('PTT')!;
    expect(p.quantity).toBe(15);
    expect(p.avgPrice).toBe(50);
    expect(p.realizedPL).toBeCloseTo(50, 6);
  });

  it('derives the split ratio from mainQuantity when metadata has none', () => {
    const txs = [
      tx({ type: 'BUY', executedAt: '2026-03-01', mainQuantity: 10, mainPrice: 100 }),
      tx({ type: 'SPLIT', executedAt: '2026-03-02', mainQuantity: 100 }),
    ];
    expect(replayPositions(txs, new Date('2026-04-01')).get('PTT')!.quantity).toBe(100);
  });

  it('resets avg cost after a full exit and re-entry', () => {
    const txs = [
      tx({ type: 'BUY', executedAt: '2026-05-01', mainQuantity: 10, mainPrice: 10 }),
      tx({ type: 'SELL', executedAt: '2026-05-02', mainQuantity: 10, mainPrice: 12 }),
      tx({ type: 'BUY', executedAt: '2026-05-03', mainQuantity: 5, mainPrice: 30 }),
    ];
    const p = replayPositions(txs, new Date('2026-06-01')).get('PTT')!;
    expect(p.quantity).toBe(5);
    expect(p.avgPrice).toBe(30);
    expect(p.realizedPL).toBeCloseTo(20, 6);
  });

  it('skips cash-only transactions', () => {
    const txs = [tx({ type: 'DEPOSIT', executedAt: '2026-01-01', mainAssetId: null, baseCurrAmount: 1000 })];
    expect(replayPositions(txs, new Date('2026-02-01')).size).toBe(0);
  });
});
