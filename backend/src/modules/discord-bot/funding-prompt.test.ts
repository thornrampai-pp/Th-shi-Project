import { describe, it, expect } from 'vitest';
import { fundingChoiceFromAction, fundingPrompt } from './funding-prompt';
import type { FundingQuestion } from '../transaction/funding-question';

const q = (over: Partial<FundingQuestion> = {}): FundingQuestion => ({
  currency: 'USD',
  buyAmount: 229.76,
  sellAmount: 0,
  cash: 212.52,
  available: 212.52,
  shortfall: 17.24,
  kind: 'has_cash',
  ...over,
});
const id = (action: string) => `x:${action}:1`;
type C = { label?: string; components?: C[] };
const labels = (p: ReturnType<typeof fundingPrompt>) =>
  (p.components as C[]).flatMap((row) => row.components ?? []).map((c) => c.label);

describe('fundingPrompt — asking where the money comes from on Discord', () => {
  it('with cash: offers the shared cash first (saying what gets topped up) or a full deposit', () => {
    const p = fundingPrompt([q()], id);
    expect(p.content).toContain('**USD** ซื้อรวม $229.76 · เงินสดกลาง $212.52 · ขาด $17.24');
    expect(p.content).toContain('จะใช้เงินจากไหน');
    expect(labels(p)).toEqual(['💵 ใช้เงินสดกลาง + เติม $17.24', '💰 เติมเงินใหม่ทั้งหมด']);
  });

  it('cash covers it: the first button says no top-up', () => {
    expect(labels(fundingPrompt([q({ shortfall: 0, buyAmount: 100 })], id))[0]).toBe('💵 ใช้เงินสดกลาง (ไม่ต้องเติม)');
  });

  it('no cash: warns and asks to confirm the top-up', () => {
    const p = fundingPrompt([q({ kind: 'no_cash', cash: 0, available: 0, shortfall: 229.76 })], id);
    expect(p.content).toContain('⚠️ ไม่มีเงินสด — ต้องเติมเงิน $229.76');
    expect(labels(p)).toEqual(['💰 ยืนยัน เติมเงิน']);
  });

  it('several currencies: one line each, a generic top-up label', () => {
    const p = fundingPrompt([q(), q({ currency: 'THB', buyAmount: 500, cash: 0, available: 0, shortfall: 500, kind: 'no_cash' })], id);
    expect(p.content.split('\n').filter((l) => l.startsWith('•'))).toHaveLength(2);
    expect(labels(p)[0]).toBe('💵 ใช้เงินสดกลางก่อน แล้วเติมส่วนที่ขาด');
  });

  it('maps the clicked action back to a funding mode', () => {
    expect(fundingChoiceFromAction('fund_cash')).toBe('CASH_FIRST');
    expect(fundingChoiceFromAction('fund_deposit')).toBe('DEPOSIT_ALL');
    expect(fundingChoiceFromAction('other')).toBeNull();
  });
});
