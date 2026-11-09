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

  it('closes a position the sell would leave as dust (fractional-share rounding after a split)', () => {
    const txs = [
      tx({ type: 'BUY', executedAt: '2024-09-13', mainQuantity: 0.0134256, mainPrice: 440.95 }),
      tx({ type: 'SPLIT', executedAt: '2024-10-01', metadata: { ratio: 10 } }),
      tx({ type: 'SELL', executedAt: '2024-10-31', mainQuantity: 0.1342556, mainPrice: 33.34, fee: 0.01 }),
    ];
    const p = replayPositions(txs, new Date('2024-12-31')).get('PTT')!;
    expect(p.quantity).toBe(0);
    expect(p.lots).toHaveLength(0);
    // The dust's cost leaves with the sale: proceeds - fee - full cost basis.
    expect(p.realizedPL).toBeCloseTo(0.1342556 * 33.34 - 0.01 - 0.0134256 * 440.95, 8);
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

describe('replayPositions — transfers between portfolios', () => {
  // Source: 10 @ 30 (Sep 1), 5 @ 40 (Sep 10); then 12 shares leave on Sep 20.
  const sourceTxs = [
    tx({ type: 'BUY', executedAt: '2026-09-01', mainQuantity: 10, mainPrice: 30 }),
    tx({ type: 'BUY', executedAt: '2026-09-10', mainQuantity: 5, mainPrice: 40 }),
    tx({ type: 'TRANSFER_OUT', executedAt: '2026-09-20', mainQuantity: 12, mainPrice: 380 / 12, baseCurrAmount: 380 }),
  ];
  // What transfer.service.ts records on the destination: the lots that left, as they were.
  const movedLots = [
    { quantity: 10, unitCost: 30, executedAt: '2026-09-01T00:00:00.000Z' },
    { quantity: 2, unitCost: 40, executedAt: '2026-09-10T00:00:00.000Z' },
  ];
  const transferIn = (metadata: unknown) =>
    tx({ type: 'TRANSFER_IN', executedAt: '2026-09-20', mainQuantity: 12, mainPrice: 380 / 12, baseCurrAmount: 380, metadata });

  it('TRANSFER_OUT takes lots FIFO, keeps the remaining lots cost, and realizes nothing', () => {
    const p = replayPositions(sourceTxs, new Date('2026-12-31')).get('PTT')!;
    expect(p.quantity).toBe(3);
    expect(p.avgPrice).toBeCloseTo(40, 9); // only the 5 @ 40 lot is left, 3 of it
    expect(p.lots).toHaveLength(1);
    expect(p.realizedPL).toBe(0);
  });

  it('TRANSFER_IN recreates the moved lots with their original price and purchase date', () => {
    const p = replayPositions([transferIn({ lots: movedLots })], new Date('2026-12-31')).get('PTT')!;
    expect(p.quantity).toBe(12);
    expect(p.avgPrice).toBeCloseTo(380 / 12, 9);
    expect(p.lots.map((l) => [l.quantity, l.unitCost, l.executedAt.toISOString()])).toEqual([
      [10, 30, '2026-09-01T00:00:00.000Z'],
      [2, 40, '2026-09-10T00:00:00.000Z'],
    ]);
    expect(p.realizedPL).toBe(0);
  });

  it('conserves shares and cost across both sides', () => {
    const cost = (lots: { quantity: number; unitCost: number }[]) => lots.reduce((s, l) => s + l.quantity * l.unitCost, 0);
    const before = replayPositions(sourceTxs.slice(0, 2), new Date('2026-12-31')).get('PTT')!;
    const out = replayPositions(sourceTxs, new Date('2026-12-31')).get('PTT')!;
    const into = replayPositions([transferIn({ lots: movedLots })], new Date('2026-12-31')).get('PTT')!;
    expect(out.quantity + into.quantity).toBe(before.quantity);
    expect(cost(out.lots) + cost(into.lots)).toBeCloseTo(cost(before.lots), 9);
  });

  it('a later SELL on the destination consumes the moved lots oldest-first, at their original cost', () => {
    const txs = [
      tx({ type: 'BUY', executedAt: '2026-09-15', mainQuantity: 4, mainPrice: 35 }), // already held there, bought between the two moved lots
      transferIn({ lots: movedLots }),
      tx({ type: 'SELL', executedAt: '2026-10-01', mainQuantity: 11, mainPrice: 50 }),
    ];
    const p = replayPositions(txs, new Date('2026-12-31')).get('PTT')!;
    // FIFO by purchase date: 10 @ 30 (Sep 1) + 1 @ 40 (Sep 10) = 340 cost; proceeds 550.
    expect(p.realizedPL).toBeCloseTo(550 - 340, 9);
    expect(p.quantity).toBe(5);
    // Left: 1 @ 40 (Sep 10) and 4 @ 35 (Sep 15) = 180 / 5
    expect(p.avgPrice).toBeCloseTo(180 / 5, 9);
  });

  it('falls back to one lot at the average cost when the metadata has no usable lots', () => {
    for (const metadata of [null, {}, { lots: [] }, { lots: [{ quantity: 'x' }] }, { lots: [movedLots[0]] /* 10 ≠ 12 */ }]) {
      const p = replayPositions([transferIn(metadata)], new Date('2026-12-31')).get('PTT')!;
      expect(p.quantity).toBe(12);
      expect(p.lots).toHaveLength(1);
      expect(p.lots[0]!.unitCost).toBeCloseTo(380 / 12, 9);
      expect(p.lots[0]!.executedAt.toISOString()).toBe(new Date('2026-09-20').toISOString());
    }
  });

  it('merges into an existing holding with a weighted-average cost', () => {
    const txs = [tx({ type: 'BUY', executedAt: '2026-09-05', mainQuantity: 8, mainPrice: 50 }), transferIn({ lots: movedLots })];
    const p = replayPositions(txs, new Date('2026-12-31')).get('PTT')!;
    expect(p.quantity).toBe(20);
    expect(p.avgPrice).toBeCloseTo((8 * 50 + 380) / 20, 9);
  });

  it('ignores a transfer after asOf', () => {
    const p = replayPositions(sourceTxs, new Date('2026-09-15')).get('PTT')!;
    expect(p.quantity).toBe(15);
  });
});
