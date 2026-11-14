import { describe, it, expect } from 'vitest';
import { describeFundingQuestion, fundingQuestions } from './funding-question';

const cash = [
  { portfolioId: 'fire', portfolioName: 'Fire', currency: 'USD', balance: 0.5 },
  { portfolioId: 'stock', portfolioName: 'Stock', currency: 'USD', balance: 40 },
  { portfolioId: 'stock', portfolioName: 'Stock', currency: 'THB', balance: -1e-8 },
];

describe('fundingQuestions — one question per currency (cash is one shared pool)', () => {
  const groups = [
    { symbol: 'VOO', buyAmount: 229.76, sellAmount: 0, currency: 'USD' },
    { symbol: 'SCHD', buyAmount: 0, sellAmount: 212.02, currency: 'USD' },
    { symbol: 'RKLB', buyAmount: 37, sellAmount: 0, currency: 'USD' },
    { symbol: 'PTT', buyAmount: 500, sellAmount: 0, currency: 'THB' },
  ];
  const qs = fundingQuestions({ groups, cash });

  it("pools every portfolio's cash with the sales in the same file", () => {
    expect(qs.find((q) => q.currency === 'USD')).toEqual({
      currency: 'USD',
      buyAmount: 266.76,
      sellAmount: 212.02,
      cash: 40.5,
      available: 252.52,
      shortfall: 14.24,
      kind: 'has_cash',
    });
  });

  it('a currency with no cash at all is flagged so the user is told to top up', () => {
    expect(qs.find((q) => q.currency === 'THB')).toMatchObject({ cash: 0, available: 0, shortfall: 500, kind: 'no_cash' });
  });

  it('asks nothing for a currency that is only sold', () => {
    expect(fundingQuestions({ groups: [{ symbol: 'X', buyAmount: 0, sellAmount: 9, currency: 'USD' }], cash })).toEqual([]);
  });
});

describe('describeFundingQuestion — the Thai text the user sees', () => {
  const base = { currency: 'USD', buyAmount: 229.76, sellAmount: 212.02, cash: 0.5, available: 212.52, shortfall: 17.24 };

  it('has cash: says how much is in the shared pool and what is missing', () => {
    expect(describeFundingQuestion({ ...base, kind: 'has_cash' })).toBe(
      '**USD** ซื้อรวม $229.76 · เงินสดกลาง $212.52 (รวมเงินจากการขายในไฟล์นี้ $212.02) · ขาด $17.24',
    );
  });

  it('enough cash: no top-up', () => {
    expect(describeFundingQuestion({ ...base, sellAmount: 0, available: 300, cash: 300, shortfall: 0, kind: 'has_cash' })).toBe(
      '**USD** ซื้อรวม $229.76 · เงินสดกลาง $300.00 · พอจ่าย ไม่ต้องเติมเงิน',
    );
  });

  it('no cash: warns that it has to be topped up', () => {
    expect(describeFundingQuestion({ ...base, buyAmount: 37, sellAmount: 0, cash: 0, available: 0, shortfall: 37, kind: 'no_cash' })).toBe(
      '**USD** ซื้อรวม $37.00 · ⚠️ ไม่มีเงินสด — ต้องเติมเงิน $37.00',
    );
  });
});
