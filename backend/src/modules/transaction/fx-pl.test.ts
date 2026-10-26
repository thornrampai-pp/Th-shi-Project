import { describe, it, expect } from 'vitest';
import { splitPL } from './fx-pl';

describe('splitPL', () => {
  it('pure FX gain: same USD price, THB weakened 33 → 34', () => {
    // Buy 10 AAPL @ $150 at 33 = 49,500 THB; sell 10 @ $150 at 34 = 51,000 THB
    const r = splitPL([{ quantity: 10, unitCost: 150, fxRate: 33 }], 1_500, 34);
    expect(r.costBasisHome).toBe(49_500);
    expect(r.valueHome).toBe(51_000);
    expect(r.plHome).toBe(1_500);
    expect(r.stockPLHome).toBe(0);
    expect(r.fxPLHome).toBe(1_500);
    expect(r.pl).toBe(0);
  });

  it('pure stock gain: rate unchanged', () => {
    const r = splitPL([{ quantity: 10, unitCost: 150, fxRate: 33 }], 1_600, 33);
    expect(r.stockPLHome).toBe(3_300);
    expect(r.fxPLHome).toBe(0);
    expect(r.plHome).toBe(3_300);
  });

  it('stock gain but FX loss can net to a loss in THB', () => {
    // +$10 on the stock, but THB strengthened 35 → 31
    const r = splitPL([{ quantity: 1, unitCost: 100, fxRate: 35 }], 110, 31);
    expect(r.pl).toBe(10); // a gain in USD...
    expect(r.stockPLHome).toBe(310);
    expect(r.fxPLHome).toBe(-400);
    expect(r.plHome).toBe(-90); // ...a loss in THB
  });

  it('uses each lot’s own purchase rate', () => {
    const lots = [
      { quantity: 5, unitCost: 100, fxRate: 32 },
      { quantity: 5, unitCost: 120, fxRate: 36 },
    ];
    const r = splitPL(lots, 1_300, 34);
    expect(r.costBasis).toBe(1_100);
    expect(r.costBasisHome).toBe(5 * 100 * 32 + 5 * 120 * 36); // 37,600
    expect(r.fxPLHome).toBe(500 * (34 - 32) + 600 * (34 - 36)); // −200
    expect(r.stockPLHome).toBe(200 * 34);
    expect(r.plHome).toBeCloseTo(r.stockPLHome + r.fxPLHome, 9);
  });

  it('home-currency asset has no FX component', () => {
    const r = splitPL([{ quantity: 100, unitCost: 35.9, fxRate: 1 }], 3_700, 1);
    expect(r.fxPLHome).toBe(0);
    expect(r.plHome).toBeCloseTo(110, 9);
  });

  it('stock + FX always equals total', () => {
    const cases: [number, number, number, number][] = [
      [3, 17.3, 31.2, 33.7],
      [0.5, 2_000, 36.1, 30.05],
      [1_000, 0.12, 33, 33],
    ];
    for (const [qty, cost, buyRate, sellRate] of cases) {
      const r = splitPL([{ quantity: qty, unitCost: cost, fxRate: buyRate }], qty * cost * 1.07 - 1, sellRate);
      expect(r.stockPLHome + r.fxPLHome).toBeCloseTo(r.plHome, 6);
    }
  });

  it('no lots → everything is proceeds', () => {
    const r = splitPL([], 0, 34);
    expect(r).toMatchObject({ costBasis: 0, costBasisHome: 0, plHome: 0, fxPLHome: 0, stockPLHome: 0 });
  });
});
