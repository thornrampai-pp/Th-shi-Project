import { describe, it, expect } from 'vitest';
import { buildSlipPrompt, parseSlipBatch } from './slip-extraction';

const slip = (amount: number, transRef: string) => ({ amount, currency: 'THB', transRef, confidence: 'high' });

describe('parseSlipBatch', () => {
  it('keeps one result per image, in order', () => {
    const out = parseSlipBatch(JSON.stringify([slip(200.85, 'A1'), slip(99.75, 'B2')]), 2);
    expect(out.map((s) => [s.amount, s.transRef])).toEqual([
      [200.85, 'A1'],
      [99.75, 'B2'],
    ]);
  });

  it('accepts a bare object for a single image', () => {
    expect(parseSlipBatch(JSON.stringify(slip(10, 'X')), 1)[0]?.transRef).toBe('X');
  });

  it('throws when the count is off, since results are matched to images by position', () => {
    expect(() => parseSlipBatch(JSON.stringify([slip(1, 'A')]), 2)).toThrow(/1 result\(s\) for 2/);
    expect(() => parseSlipBatch(JSON.stringify([slip(1, 'A'), slip(2, 'B'), slip(3, 'C')]), 2)).toThrow();
  });

  it('throws on a bare object when several images were sent', () => {
    expect(() => parseSlipBatch(JSON.stringify(slip(1, 'A')), 2)).toThrow(/not a JSON array/);
  });

  it('throws on non-JSON', () => {
    expect(() => parseSlipBatch('```json\n[]\n```', 1)).toThrow(/not valid JSON/);
  });

  it('normalizes each entry (not-a-slip image → all null, low confidence)', () => {
    const [notSlip] = parseSlipBatch(JSON.stringify([{ amount: 'n/a', transRef: '  ', currency: ' usd ' }]), 1);
    expect(notSlip).toMatchObject({ amount: null, transRef: null, currency: 'USD', confidence: 'low' });
  });
});

describe('buildSlipPrompt', () => {
  it('asks for exactly as many objects as images', () => {
    expect(buildSlipPrompt(3)).toContain('exactly 3 object(s)');
    expect(buildSlipPrompt(3)).toContain('"Image 1" to "Image 3"');
  });
});
