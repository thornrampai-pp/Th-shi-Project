import { describe, it, expect } from 'vitest';
import { describeFundingQuestion, fundingQuestions } from './funding-question';

const cash = [
  { portfolioId: 'fire', portfolioName: 'Fire', currency: 'USD', balance: 0.5 },
  { portfolioId: 'stock', portfolioName: 'Stock', currency: 'USD', balance: 40 },
];
const names = new Map([
  ['fire', 'Fire'],
  ['stock', 'Stock'],
  ['growth', 'Growth'],
]);

describe('fundingQuestions — one question per portfolio that buys', () => {
  const groups = [
    { symbol: 'VOO', buyAmount: 229.76, sellAmount: 0, currency: 'USD' },
    { symbol: 'SCHD', buyAmount: 0, sellAmount: 212.02, currency: 'USD' },
    { symbol: 'RKLB', buyAmount: 37, sellAmount: 0, currency: 'USD' },
    { symbol: 'AMD', buyAmount: 0, sellAmount: 56.41, currency: 'USD' },
  ];
  const portfolioOf = new Map([
    ['VOO', 'fire'],
    ['SCHD', 'fire'],
    ['RKLB', 'growth'],
    ['AMD', 'stock'],
  ]);
  const qs = fundingQuestions({ groups, portfolioOf, cash, portfolioNames: names });

  it('counts sales in the same file as cash the buys can use', () => {
    expect(qs.find((q) => q.portfolioId === 'fire')).toMatchObject({
      buyAmount: 229.76,
      cash: 0.5,
      sellAmount: 212.02,
      available: 212.52,
      shortfall: 17.24,
      kind: 'has_cash',
    });
  });

  it('a portfolio with no cash at all is flagged so the user is told to top up', () => {
    expect(qs.find((q) => q.portfolioId === 'growth')).toMatchObject({ available: 0, shortfall: 37, kind: 'no_cash' });
  });

  it('lists other portfolios with cash left after their own buys (incl. their sales here) to borrow from', () => {
    expect(qs.find((q) => q.portfolioId === 'growth')!.others).toEqual([
      { portfolioId: 'stock', portfolioName: 'Stock', balance: 96.41 },
    ]);
  });

  it('asks nothing for a portfolio that only sells', () => {
    expect(qs.map((q) => q.portfolioId).sort()).toEqual(['fire', 'growth']);
  });
});

describe('describeFundingQuestion — the Thai text the user sees', () => {
  it('has cash: says how much is available and what is missing', () => {
    expect(
      describeFundingQuestion({
        portfolioId: 'fire',
        portfolioName: 'Fire',
        currency: 'USD',
        buyAmount: 229.76,
        sellAmount: 212.02,
        cash: 0.5,
        available: 212.52,
        shortfall: 17.24,
        kind: 'has_cash',
        others: [],
      }),
    ).toBe('**Fire** ซื้อรวม $229.76 · มีเงินสด $212.52 (รวมเงินจากการขายในไฟล์นี้ $212.02) · ขาด $17.24');
  });

  it('no cash: warns that it has to be topped up', () => {
    expect(
      describeFundingQuestion({
        portfolioId: 'growth',
        portfolioName: 'Growth',
        currency: 'USD',
        buyAmount: 37,
        sellAmount: 0,
        cash: 0,
        available: 0,
        shortfall: 37,
        kind: 'no_cash',
        others: [],
      }),
    ).toBe('**Growth** ซื้อรวม $37.00 · ⚠️ ไม่มีเงินสดในพอร์ต — ต้องเติมเงิน $37.00');
  });
});
