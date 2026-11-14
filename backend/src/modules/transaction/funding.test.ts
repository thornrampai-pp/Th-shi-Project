import { describe, it, expect } from 'vitest';
import { planFunding } from './funding';

describe('planFunding — where a BUY gets its money (one shared cash pool per currency)', () => {
  it('CASH_FIRST spends the cash already in the portfolio and deposits only the shortfall', () => {
    expect(planFunding({ mode: 'CASH_FIRST', cost: 229.76, cash: 212.52 })).toEqual({
      fromCash: 212.52,
      transfers: [],
      transfer: 0,
      deposit: 17.24,
    });
  });

  it('CASH_FIRST with enough cash deposits nothing', () => {
    expect(planFunding({ mode: 'CASH_FIRST', cost: 50, cash: 212.52 })).toMatchObject({ fromCash: 50, transfer: 0, deposit: 0 });
  });

  it('CASH_FIRST with no cash anywhere deposits the full cost', () => {
    expect(planFunding({ mode: 'CASH_FIRST', cost: 37, cash: 0 })).toMatchObject({ fromCash: 0, transfer: 0, deposit: 37 });
  });

  it('then draws on the other portfolios, largest balance first, before depositing', () => {
    expect(
      planFunding({
        mode: 'CASH_FIRST',
        cost: 100,
        cash: 10,
        pool: [
          { portfolioId: 'small', balance: 20 },
          { portfolioId: 'big', balance: 50 },
          { portfolioId: 'empty', balance: 0 },
        ],
      }),
    ).toEqual({
      fromCash: 10,
      transfers: [
        { portfolioId: 'big', amount: 50 },
        { portfolioId: 'small', amount: 20 },
      ],
      transfer: 70,
      deposit: 20,
    });
  });

  it('stops drawing once the cost is covered', () => {
    expect(
      planFunding({ mode: 'CASH_FIRST', cost: 30, cash: 0, pool: [{ portfolioId: 'a', balance: 500 }, { portfolioId: 'b', balance: 100 }] }),
    ).toEqual({ fromCash: 0, transfers: [{ portfolioId: 'a', amount: 30 }], transfer: 30, deposit: 0 });
  });

  it('DEPOSIT_ALL deposits the whole cost and leaves all cash alone', () => {
    expect(planFunding({ mode: 'DEPOSIT_ALL', cost: 229.76, cash: 212.52, pool: [{ portfolioId: 'a', balance: 9 }] })).toEqual({
      fromCash: 0,
      transfers: [],
      transfer: 0,
      deposit: 229.76,
    });
  });

  it('CASH_ONLY never deposits or borrows; the caller rejects the BUY when cash is short', () => {
    expect(planFunding({ mode: 'CASH_ONLY', cost: 100, cash: 40, pool: [{ portfolioId: 'a', balance: 90 }] })).toEqual({
      fromCash: 100,
      transfers: [],
      transfer: 0,
      deposit: 0,
    });
  });

  it('ignores negative balances and rounds to 8 decimals (no 1e-15 deposits)', () => {
    expect(planFunding({ mode: 'CASH_FIRST', cost: 0.3, cash: 0.1 + 0.2 })).toMatchObject({ fromCash: 0.3, deposit: 0 });
    expect(planFunding({ mode: 'CASH_FIRST', cost: 5, cash: -2, pool: [{ portfolioId: 'a', balance: -1e-8 }] })).toEqual({
      fromCash: 0,
      transfers: [],
      transfer: 0,
      deposit: 5,
    });
  });
});
