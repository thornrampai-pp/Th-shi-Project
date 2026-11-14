import { describe, it, expect } from 'vitest';
import { planFunding } from './funding';

describe('planFunding — where a BUY gets its money', () => {
  it('CASH_FIRST spends the cash already in the portfolio and deposits only the shortfall', () => {
    expect(planFunding({ mode: 'CASH_FIRST', cost: 229.76, cash: 212.52 })).toEqual({
      fromCash: 212.52,
      transfer: 0,
      deposit: 17.24,
    });
  });

  it('CASH_FIRST with enough cash deposits nothing', () => {
    expect(planFunding({ mode: 'CASH_FIRST', cost: 50, cash: 212.52 })).toEqual({ fromCash: 50, transfer: 0, deposit: 0 });
  });

  it('CASH_FIRST with no cash deposits the full cost', () => {
    expect(planFunding({ mode: 'CASH_FIRST', cost: 37, cash: 0 })).toEqual({ fromCash: 0, transfer: 0, deposit: 37 });
  });

  it('takes the shortfall from another portfolio first when one is named, then deposits what is still missing', () => {
    expect(planFunding({ mode: 'CASH_FIRST', cost: 100, cash: 10, otherCash: 60 })).toEqual({
      fromCash: 10,
      transfer: 60,
      deposit: 30,
    });
    expect(planFunding({ mode: 'CASH_FIRST', cost: 100, cash: 10, otherCash: 500 })).toEqual({
      fromCash: 10,
      transfer: 90,
      deposit: 0,
    });
  });

  it('DEPOSIT_ALL deposits the whole cost and leaves existing cash alone', () => {
    expect(planFunding({ mode: 'DEPOSIT_ALL', cost: 229.76, cash: 212.52 })).toEqual({ fromCash: 0, transfer: 0, deposit: 229.76 });
  });

  it('CASH_ONLY never deposits; the caller rejects the BUY when cash is short', () => {
    expect(planFunding({ mode: 'CASH_ONLY', cost: 100, cash: 40 })).toEqual({ fromCash: 100, transfer: 0, deposit: 0 });
  });

  it('ignores negative balances and rounds to 8 decimals (no 1e-15 deposits)', () => {
    expect(planFunding({ mode: 'CASH_FIRST', cost: 0.3, cash: 0.1 + 0.2 })).toEqual({ fromCash: 0.3, transfer: 0, deposit: 0 });
    expect(planFunding({ mode: 'CASH_FIRST', cost: 5, cash: -2 })).toEqual({ fromCash: 0, transfer: 0, deposit: 5 });
  });
});
