import { describe, it, expect } from 'vitest';
import { fundingChoiceFromAction, fundingPrompt } from './funding-prompt';
import type { FundingQuestion } from '../transaction/funding-question';

const q = (over: Partial<FundingQuestion> = {}): FundingQuestion => ({
  portfolioId: 'fire',
  portfolioName: 'Fire',
  currency: 'USD',
  buyAmount: 229.76,
  sellAmount: 0,
  cash: 212.52,
  available: 212.52,
  shortfall: 17.24,
  kind: 'has_cash',
  others: [],
  ...over,
});
const id = (action: string) => `x:${action}:1`;
type C = { label?: string; placeholder?: string; custom_id?: string; options?: unknown; components?: C[] };
const flat = (p: ReturnType<typeof fundingPrompt>) => (p.components as C[]).flatMap((row) => row.components ?? []);
const labels = (p: ReturnType<typeof fundingPrompt>) => flat(p).map((c) => c.label ?? c.placeholder);

describe('fundingPrompt — asking where the money comes from on Discord', () => {
  it('with cash: offers cash first (saying what gets topped up) or a full deposit', () => {
    const p = fundingPrompt([q()], id);
    expect(p.content).toContain('**Fire** ซื้อรวม $229.76 · มีเงินสด $212.52 · ขาด $17.24');
    expect(p.content).toContain('จะใช้เงินจากไหน');
    expect(labels(p)).toEqual(['💵 ใช้เงินสดก่อน + เติม $17.24', '💰 เติมเงินใหม่ทั้งหมด']);
  });

  it('cash covers it: the first button says no top-up', () => {
    expect(labels(fundingPrompt([q({ shortfall: 0, buyAmount: 100 })], id))[0]).toBe('💵 ใช้เงินสด (ไม่ต้องเติม)');
  });

  it('no cash: warns and asks to confirm the top-up', () => {
    const p = fundingPrompt([q({ kind: 'no_cash', cash: 0, available: 0, shortfall: 229.76 })], id);
    expect(p.content).toContain('⚠️ ไม่มีเงินสดในพอร์ต — ต้องเติมเงิน $229.76');
    expect(labels(p)).toEqual(['💰 ยืนยัน เติมเงิน']);
  });

  it('a single question offers to borrow from another portfolio with cash', () => {
    const p = fundingPrompt([q({ others: [{ portfolioId: 'stock', portfolioName: 'Stock', balance: 60.88 }] })], id);
    expect(labels(p)).toContain('หรือใช้เงินสดจากพอร์ตอื่น');
    const select = flat(p).find((c) => c.custom_id === 'x:fund_from:1')!;
    expect(select.options).toEqual([{ label: 'Stock · มี $60.88', value: 'stock' }]);
  });

  it('maps the clicked action back to a funding choice', () => {
    expect(fundingChoiceFromAction('fund_cash', [])).toEqual({ mode: 'CASH_FIRST' });
    expect(fundingChoiceFromAction('fund_deposit', [])).toEqual({ mode: 'DEPOSIT_ALL' });
    expect(fundingChoiceFromAction('fund_from', ['stock'])).toEqual({ mode: 'CASH_FIRST', fromPortfolioId: 'stock' });
    expect(fundingChoiceFromAction('fund_from', [])).toBeNull();
    expect(fundingChoiceFromAction('other', [])).toBeNull();
  });
});
