/**
 * Thai personal income tax (ภาษีเงินได้บุคคลธรรมดา) — progressive-rate method.
 *
 * PURE: no I/O, no Prisma, no FX. The caller decides what counts as income and which
 * allowances apply; this only applies the bracket table for the given tax year.
 *
 * Out of scope (the caller must handle these before passing totals in):
 * - expense deductions per income type (e.g. 40(1) salary 50% capped at 100,000)
 * - the alternative 0.5%-of-gross method for non-salary income ≥ 120,000
 * - dividend tax credit vs. 10% final withholding election for Thai dividends
 *
 * Rules change — always have results checked by an accountant / the Revenue Department.
 */

export interface TaxBracket {
  /** Upper bound of net income for this bracket, inclusive (THB). null = no upper bound. */
  upTo: number | null;
  /** Marginal rate as a fraction (0.05 = 5%). */
  rate: number;
}

interface BracketTable {
  id: string;
  /** First tax year (CE) the table applies to. */
  fromYear: number;
  brackets: TaxBracket[];
}

/**
 * Tables ordered oldest → newest. A year uses the newest table whose fromYear ≤ year.
 * Add a new table here when the law changes — don't edit an existing one, so past
 * years keep computing as they were.
 */
const BRACKET_TABLES: BracketTable[] = [
  {
    // พ.ร.ก. แก้ไขเพิ่มเติมประมวลรัษฎากร (ฉบับที่ 29) พ.ศ. 2560 — tax year 2560 (2017) onward
    id: 'TH-PIT-2560',
    fromYear: 2017,
    brackets: [
      { upTo: 150_000, rate: 0 },
      { upTo: 300_000, rate: 0.05 },
      { upTo: 500_000, rate: 0.1 },
      { upTo: 750_000, rate: 0.15 },
      { upTo: 1_000_000, rate: 0.2 },
      { upTo: 2_000_000, rate: 0.25 },
      { upTo: 5_000_000, rate: 0.3 },
      { upTo: null, rate: 0.35 },
    ],
  },
];

export const TAX_CALCULATOR_DISCLAIMER =
  'ผลลัพธ์เป็นการประมาณการตามอัตราภาษีขั้นบันได ไม่ใช่คำแนะนำทางภาษี — กรุณาตรวจสอบกับนักบัญชีหรือกรมสรรพากร เนื่องจากกฎอาจเปลี่ยนแปลงตามปีภาษี';

export class TaxCalculationError extends Error {}

export interface TaxDeduction {
  label: string;
  amount: number;
}

export interface PersonalIncomeTaxInput {
  /** Tax year in CE (e.g. 2026 = ปีภาษี 2569). */
  taxYear: number;
  /** Total assessable income (เงินได้พึงประเมิน), THB. */
  totalIncome: number;
  /** Expense deductions already computed by the caller (ค่าใช้จ่าย), THB. */
  expenses?: number;
  /** Allowances (ค่าลดหย่อน), e.g. personal 60,000, SSF/RMF, social security. */
  deductions?: TaxDeduction[];
  /** Tax already paid that can be credited: withholding tax, foreign tax credit, THB. */
  taxCredits?: number;
}

export interface BracketBreakdown {
  from: number;
  upTo: number | null;
  rate: number;
  taxableAmount: number;
  tax: number;
}

export interface PersonalIncomeTaxResult {
  taxYear: number;
  ruleSetId: string;
  totalIncome: number;
  expenses: number;
  totalDeductions: number;
  /** เงินได้สุทธิ = income − expenses − deductions, floored at 0. */
  netIncome: number;
  brackets: BracketBreakdown[];
  grossTax: number;
  taxCredits: number;
  /** Still to pay after credits (≥ 0). */
  taxPayable: number;
  /** Refund due when credits exceed the tax (≥ 0). */
  refund: number;
  /** grossTax / totalIncome, as a fraction. */
  effectiveRate: number;
  /** Rate of the highest bracket reached. */
  marginalRate: number;
  disclaimer: string;
}

export function getBracketTable(taxYear: number): BracketTable {
  if (!Number.isInteger(taxYear)) throw new TaxCalculationError('taxYear must be an integer (CE, e.g. 2026)');
  if (taxYear > 2400) throw new TaxCalculationError('taxYear must be in CE (ค.ศ.), not BE — e.g. 2026, not 2569');

  const table = [...BRACKET_TABLES].reverse().find((t) => t.fromYear <= taxYear);
  if (!table) {
    throw new TaxCalculationError(`No tax bracket table for ${taxYear} — supported from ${BRACKET_TABLES[0]!.fromYear}`);
  }
  return table;
}

// All arithmetic in satang (integer) so results don't carry float noise.
const toSatang = (thb: number) => Math.round(thb * 100);
const toThb = (satang: number) => satang / 100;

function assertAmount(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) throw new TaxCalculationError(`${field} must be a non-negative number`);
}

export function calculatePersonalIncomeTax(input: PersonalIncomeTaxInput): PersonalIncomeTaxResult {
  const table = getBracketTable(input.taxYear);
  const expenses = input.expenses ?? 0;
  const deductions = input.deductions ?? [];
  const taxCredits = input.taxCredits ?? 0;

  assertAmount(input.totalIncome, 'totalIncome');
  assertAmount(expenses, 'expenses');
  assertAmount(taxCredits, 'taxCredits');
  for (const d of deductions) assertAmount(d.amount, `deduction "${d.label}"`);

  const incomeS = toSatang(input.totalIncome);
  const expensesS = toSatang(expenses);
  const deductionsS = deductions.reduce((sum, d) => sum + toSatang(d.amount), 0);
  const netIncomeS = Math.max(0, incomeS - expensesS - deductionsS);

  const brackets: BracketBreakdown[] = [];
  let grossTaxS = 0;
  let lowerS = 0;
  let marginalRate = 0;

  for (const bracket of table.brackets) {
    const upperS = bracket.upTo == null ? Infinity : toSatang(bracket.upTo);
    const taxableS = Math.max(0, Math.min(netIncomeS, upperS) - lowerS);
    const taxS = Math.round(taxableS * bracket.rate);

    brackets.push({
      from: toThb(lowerS),
      upTo: bracket.upTo,
      rate: bracket.rate,
      taxableAmount: toThb(taxableS),
      tax: toThb(taxS),
    });

    grossTaxS += taxS;
    if (taxableS > 0) marginalRate = bracket.rate;
    if (upperS === Infinity) break;
    lowerS = upperS;
  }

  const creditsS = toSatang(taxCredits);

  return {
    taxYear: input.taxYear,
    ruleSetId: table.id,
    totalIncome: toThb(incomeS),
    expenses: toThb(expensesS),
    totalDeductions: toThb(deductionsS),
    netIncome: toThb(netIncomeS),
    brackets,
    grossTax: toThb(grossTaxS),
    taxCredits: toThb(creditsS),
    taxPayable: toThb(Math.max(0, grossTaxS - creditsS)),
    refund: toThb(Math.max(0, creditsS - grossTaxS)),
    effectiveRate: incomeS > 0 ? grossTaxS / incomeS : 0,
    marginalRate,
    disclaimer: TAX_CALCULATOR_DISCLAIMER,
  };
}
