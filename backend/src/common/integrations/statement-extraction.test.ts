import { describe, it, expect } from 'vitest';
import { buildStatementPrompt, parseStatementExtraction } from './statement-extraction';

const row = (overrides: Record<string, unknown> = {}) => ({
  orderId: '686800',
  date: '2026-10-15',
  transactionType: 'BUY',
  symbol: 'xly',
  quantity: 0.0398891,
  price: 111.06,
  currency: 'usd',
  fee: 0,
  totalAmount: 4.43,
  ...overrides,
});

describe('parseStatementExtraction', () => {
  it('reads broker and every row, normalizing symbol/currency case', () => {
    const out = parseStatementExtraction(JSON.stringify({ broker: ' KKP Dime ', rows: [row(), row({ orderId: '691638', symbol: 'ko' })] }));
    expect(out.broker).toBe('KKP Dime');
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({ orderId: '686800', symbol: 'XLY', currency: 'USD', transactionType: 'BUY' });
    expect(out.rows[1]).toMatchObject({ orderId: '691638', symbol: 'KO' });
  });

  it('treats a missing/empty rows array as no trades, not an error', () => {
    expect(parseStatementExtraction(JSON.stringify({ broker: null, rows: [] })).rows).toEqual([]);
  });

  it('throws when the reply is not valid JSON', () => {
    expect(() => parseStatementExtraction('```json\n{}\n```')).toThrow(/not valid JSON/);
  });

  it('throws when the reply has no rows field at all', () => {
    expect(() => parseStatementExtraction(JSON.stringify({ broker: 'X' }))).toThrow(/expected statement shape/);
  });

  it('normalizes a row missing most fields to all-null, not a crash', () => {
    const out = parseStatementExtraction(JSON.stringify({ rows: [{}] }));
    expect(out.rows[0]).toMatchObject({ orderId: null, transactionType: null, symbol: null, quantity: null });
  });

  it('drops a zero or negative quantity/price rather than recording it', () => {
    const out = parseStatementExtraction(JSON.stringify({ rows: [row({ quantity: 0, price: -5 })] }));
    expect(out.rows[0]).toMatchObject({ quantity: null, price: null });
  });

  it('rejects an unrecognized transactionType', () => {
    const out = parseStatementExtraction(JSON.stringify({ rows: [row({ transactionType: 'DIVIDEND' })] }));
    expect(out.rows[0]?.transactionType).toBeNull();
  });
});

describe('buildStatementPrompt', () => {
  it('tells the model how broker and fund codes map to BUY/SELL', () => {
    const prompt = buildStatementPrompt();
    for (const code of ['SUB', 'SWI', 'RED', 'SWO']) expect(prompt).toContain(code);
  });

  it('asks for the own-currency columns, not a converted one', () => {
    expect(buildStatementPrompt()).toMatch(/own currency/);
    expect(buildStatementPrompt()).toContain('"rows"');
  });
});
