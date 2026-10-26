import { describe, it, expect } from 'vitest';
import { calculatePersonalIncomeTax, getBracketTable, TaxCalculationError } from './tax-calculator';

const tax = (netIncome: number, taxYear = 2026) => calculatePersonalIncomeTax({ taxYear, totalIncome: netIncome });

describe('calculatePersonalIncomeTax — bracket boundaries (net income → tax)', () => {
  // Cumulative tax at the TOP of each bracket.
  it.each([
    [0, 0],
    [150_000, 0], //            0–150,000      exempt
    [300_000, 7_500], //        150,001–300,000   5%
    [500_000, 27_500], //       300,001–500,000  10%
    [750_000, 65_000], //       500,001–750,000  15%
    [1_000_000, 115_000], //    750,001–1M       20%
    [2_000_000, 365_000], //    1M–2M            25%
    [5_000_000, 1_265_000], //  2M–5M            30%
    [6_000_000, 1_615_000], //  > 5M             35%
  ])('net income %d → tax %d', (income, expected) => {
    expect(tax(income).grossTax).toBe(expected);
  });

  // One baht into each bracket is taxed at that bracket's rate.
  it.each([
    [150_001, 0.05, 0.05],
    [300_001, 7_500.1, 0.1],
    [500_001, 27_500.15, 0.15],
    [750_001, 65_000.2, 0.2],
    [1_000_001, 115_000.25, 0.25],
    [2_000_001, 365_000.3, 0.3],
    [5_000_001, 1_265_000.35, 0.35],
  ])('net income %d → tax %d, marginal %d', (income, expectedTax, marginal) => {
    const result = tax(income);
    expect(result.grossTax).toBe(expectedTax);
    expect(result.marginalRate).toBe(marginal);
  });

  it.each([
    [100_000, 0],
    [200_000, 2_500],
    [400_000, 17_500],
    [600_000, 42_500],
    [900_000, 95_000],
    [1_500_000, 240_000],
    [3_000_000, 665_000],
    [10_000_000, 3_015_000],
  ])('mid-bracket: net income %d → tax %d', (income, expected) => {
    expect(tax(income).grossTax).toBe(expected);
  });

  it('marginal rate is 0 when all income is in the exempt bracket', () => {
    expect(tax(120_000).marginalRate).toBe(0);
  });
});

describe('calculatePersonalIncomeTax — breakdown', () => {
  it('itemises every bracket and the items sum to grossTax', () => {
    const result = tax(1_200_000);
    expect(result.brackets).toHaveLength(8);
    expect(result.brackets.map((b) => b.taxableAmount)).toEqual([
      150_000, 150_000, 200_000, 250_000, 250_000, 200_000, 0, 0,
    ]);
    expect(result.brackets.reduce((s, b) => s + b.tax, 0)).toBe(result.grossTax);
    expect(result.grossTax).toBe(165_000);
  });

  it('reports the rule set used', () => {
    expect(tax(500_000).ruleSetId).toBe('TH-PIT-2560');
  });
});

describe('calculatePersonalIncomeTax — income, expenses, deductions', () => {
  it('subtracts expenses and deductions to get net income', () => {
    const result = calculatePersonalIncomeTax({
      taxYear: 2026,
      totalIncome: 900_000,
      expenses: 100_000,
      deductions: [
        { label: 'ส่วนตัว', amount: 60_000 },
        { label: 'ประกันสังคม', amount: 9_000 },
        { label: 'SSF', amount: 31_000 },
      ],
    });
    expect(result.totalDeductions).toBe(100_000);
    expect(result.netIncome).toBe(700_000);
    expect(result.grossTax).toBe(57_500);
    expect(result.effectiveRate).toBeCloseTo(57_500 / 900_000, 10);
  });

  it('floors net income at 0 when deductions exceed income', () => {
    const result = calculatePersonalIncomeTax({
      taxYear: 2026,
      totalIncome: 50_000,
      deductions: [{ label: 'ส่วนตัว', amount: 60_000 }],
    });
    expect(result.netIncome).toBe(0);
    expect(result.grossTax).toBe(0);
  });

  it('handles satang without float noise', () => {
    expect(tax(150_000.33).grossTax).toBe(0.02); // 0.33 × 5% = 0.0165 → 0.02
    expect(tax(0.1 + 0.2 + 300_000).grossTax).toBe(7_500.03);
  });

  it('effective rate is 0 for zero income', () => {
    expect(tax(0).effectiveRate).toBe(0);
  });
});

describe('calculatePersonalIncomeTax — credits', () => {
  it('reduces the amount payable by credits', () => {
    const result = calculatePersonalIncomeTax({ taxYear: 2026, totalIncome: 500_000, taxCredits: 7_500 });
    expect(result.taxPayable).toBe(20_000);
    expect(result.refund).toBe(0);
  });

  it('turns excess credits into a refund', () => {
    const result = calculatePersonalIncomeTax({ taxYear: 2026, totalIncome: 300_000, taxCredits: 10_000 });
    expect(result.taxPayable).toBe(0);
    expect(result.refund).toBe(2_500);
  });
});

describe('calculatePersonalIncomeTax — validation and years', () => {
  it.each([
    [{ totalIncome: -1 }, /totalIncome/],
    [{ totalIncome: Number.NaN }, /totalIncome/],
    [{ totalIncome: 1, expenses: -5 }, /expenses/],
    [{ totalIncome: 1, taxCredits: -5 }, /taxCredits/],
    [{ totalIncome: 1, deductions: [{ label: 'x', amount: -1 }] }, /deduction "x"/],
  ])('rejects invalid input %j', (partial, message) => {
    expect(() => calculatePersonalIncomeTax({ taxYear: 2026, ...partial })).toThrow(message);
  });

  it('rejects years before the earliest table', () => {
    expect(() => getBracketTable(2016)).toThrow(TaxCalculationError);
  });

  it('rejects Buddhist-era years', () => {
    expect(() => getBracketTable(2569)).toThrow(/CE/);
  });

  it('rejects non-integer years', () => {
    expect(() => getBracketTable(2026.5)).toThrow(/integer/);
  });

  it('applies the 2560 table to its first year and to later years', () => {
    expect(getBracketTable(2017).id).toBe('TH-PIT-2560');
    expect(getBracketTable(2030).id).toBe('TH-PIT-2560');
  });

  it('always includes the disclaimer', () => {
    expect(tax(1).disclaimer).toMatch(/นักบัญชี/);
  });
});
