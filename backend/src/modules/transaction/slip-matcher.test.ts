import { describe, it, expect } from 'vitest';
import type { SlipExtraction } from '../../common/integrations/gemini.util';
import { matchSlipToTransaction, parseSlipDate, slipDifferences, slipHasTime } from './slip-matcher';
import type { SlipMatchCandidate } from './slip-matcher';

function slip(overrides: Partial<SlipExtraction> = {}): SlipExtraction {
  return {
    amount: 200.85,
    currency: 'THB',
    transactionDate: '2026-10-20T14:30:00+07:00',
    transRef: 'ABC123',
    orderRef: null,
    sendingBank: null,
    receivingBank: null,
    senderName: null,
    fee: null,
    vat: null,
    netAmount: null,
    fxRate: null,
    targetAmount: null,
    targetCurrency: null,
    assetSymbol: null,
    quantity: null,
    price: null,
    transactionType: null,
    confidence: 'high',
    ...overrides,
  };
}

function tx(overrides: Partial<SlipMatchCandidate> = {}): SlipMatchCandidate {
  return {
    id: 'tx-1',
    type: 'DEPOSIT',
    executedAt: new Date('2026-10-20T07:30:00Z'),
    timeKnown: false,
    baseCurrAmount: 200.85,
    exchangeRate: null,
    currency: 'THB',
    sourceAmount: null,
    sourceCurrency: null,
    assetSymbol: null,
    quantity: null,
    price: null,
    fee: null,
    note: null,
    ...overrides,
  };
}

describe('matchSlipToTransaction', () => {
  it('matches on same-currency amount within the date window', () => {
    const r = matchSlipToTransaction(slip(), [tx()]);
    expect(r).toMatchObject({ status: 'matched', candidate: { id: 'tx-1' }, isAmountMatched: true });
  });

  it('returns not_found when the amount differs', () => {
    expect(matchSlipToTransaction(slip({ amount: 99.75 }), [tx()]).status).toBe('not_found');
  });

  it('returns not_found when the date is outside the window', () => {
    const r = matchSlipToTransaction(slip(), [tx({ executedAt: new Date('2026-10-25T07:30:00Z') })]);
    expect(r.status).toBe('not_found');
  });

  it('a transRef in the note matches regardless of amount and date', () => {
    const r = matchSlipToTransaction(slip({ amount: 1 }), [
      tx({ id: 'by-ref', baseCurrAmount: 5, executedAt: new Date('2026-01-01'), note: 'slip ABC123' }),
    ]);
    expect(r).toMatchObject({ status: 'matched', candidate: { id: 'by-ref' } });
  });

  it('matches a USD exchange via targetAmount/targetCurrency', () => {
    const r = matchSlipToTransaction(
      slip({ amount: 3400, targetAmount: 100, targetCurrency: 'USD', transactionType: 'EXCHANGE', assetSymbol: 'USD' }),
      [tx({ baseCurrAmount: 100, currency: 'USD' })],
    );
    expect(r).toMatchObject({ status: 'matched', isAmountMatched: true });
  });

  it('matches a THB slip to a USD BUY via its FX rate only when the symbol agrees', () => {
    const buy = tx({ type: 'BUY', baseCurrAmount: 10, currency: 'USD', exchangeRate: 33.5, assetSymbol: 'LLY' });
    const withSymbol = matchSlipToTransaction(slip({ amount: 335.5, assetSymbol: 'LLY' }), [buy]);
    expect(withSymbol).toMatchObject({ status: 'matched', isAmountMatched: false });
    expect(matchSlipToTransaction(slip({ amount: 335.5 }), [buy]).status).toBe('not_found');
  });

  it('prefers the candidate whose asset symbol and type agree', () => {
    const r = matchSlipToTransaction(slip({ assetSymbol: 'LLY', transactionType: 'BUY' }), [
      tx({ id: 'deposit' }),
      tx({ id: 'buy', type: 'BUY', assetSymbol: 'LLY' }),
    ]);
    expect(r).toMatchObject({ status: 'matched', candidate: { id: 'buy' } });
  });

  it('breaks a tie by time only between rows that have a real time', () => {
    const r = matchSlipToTransaction(slip(), [
      tx({ id: 'far', executedAt: new Date('2026-10-20T07:34:00Z'), timeKnown: true }),
      tx({ id: 'near', executedAt: new Date('2026-10-20T07:31:00Z'), timeKnown: true }),
    ]);
    expect(r).toMatchObject({ status: 'matched', candidate: { id: 'near' } });
  });

  it('asks (ambiguous) between same-day DCA rows that only have a date', () => {
    const r = matchSlipToTransaction(slip(), [
      tx({ id: 'a', executedAt: new Date('2026-10-20T12:00:00Z') }),
      tx({ id: 'b', executedAt: new Date('2026-10-20T03:00:00Z') }),
    ]);
    expect(r).toMatchObject({ status: 'ambiguous' });
  });

  it('treats another Bangkok day as another trade, even within 36h', () => {
    // 2026-10-21 01:00 Bangkok — the next morning's DCA.
    const r = matchSlipToTransaction(slip(), [tx({ executedAt: new Date('2026-10-20T18:00:00Z') })]);
    expect(r.status).toBe('not_found');
  });

  it('a timed row more than 5 minutes off the slip is another trade', () => {
    const r = matchSlipToTransaction(slip(), [tx({ executedAt: new Date('2026-10-20T07:40:00Z'), timeKnown: true })]);
    expect(r.status).toBe('not_found');
  });

  it('a different symbol or quantity rules a row out', () => {
    const buy = tx({ type: 'BUY', currency: 'THB', assetSymbol: 'PTT.BK', quantity: 100 });
    expect(matchSlipToTransaction(slip({ assetSymbol: 'SCB' }), [buy]).status).toBe('not_found');
    expect(matchSlipToTransaction(slip({ assetSymbol: 'PTT', quantity: 200 }), [buy]).status).toBe('not_found');
    expect(matchSlipToTransaction(slip({ assetSymbol: 'PTT', quantity: 100 }), [buy]).status).toBe('matched');
  });

  it('matches on symbol + quantity when the amount is off by a fee', () => {
    const buy = tx({ type: 'BUY', assetSymbol: 'PTT.BK', quantity: 100, baseCurrAmount: 3400 });
    const r = matchSlipToTransaction(slip({ amount: 3407.49, assetSymbol: 'PTT', quantity: 100 }), [buy]);
    expect(r).toMatchObject({ status: 'matched', isAmountMatched: false });
  });

  it('reports a tie as ambiguous when the slip has no date', () => {
    const r = matchSlipToTransaction(slip({ transactionDate: null }), [tx({ id: 'a' }), tx({ id: 'b' })]);
    expect(r.status).toBe('ambiguous');
  });
});

describe('slipDifferences', () => {
  it('flags fee and price the slip disagrees on', () => {
    const buy = tx({ type: 'BUY', price: 34, fee: 0 });
    expect(slipDifferences(slip({ fee: 7, vat: 0.49, price: 34.25 }), buy, true)).toEqual([
      'ค่าธรรมเนียมในสลิป 7.49 แต่ในรายการ 0',
      'ราคาในสลิป 34.25 แต่ในรายการ 34',
    ]);
    expect(slipDifferences(slip({ fee: null, price: 34 }), buy, true)).toEqual([]);
  });
});

describe('parseSlipDate', () => {
  it('reads an offset-less timestamp as Bangkok time', () => {
    expect(parseSlipDate('2026-10-20T14:30:00')?.toISOString()).toBe('2026-10-20T07:30:00.000Z');
  });

  it('reads a bare date as midday Bangkok', () => {
    expect(parseSlipDate('2026-10-20')?.toISOString()).toBe('2026-10-20T05:00:00.000Z');
  });

  it('returns null for garbage', () => {
    expect(parseSlipDate('yesterday')).toBeNull();
  });

  it('slipHasTime tells a timestamp from a bare date', () => {
    expect(slipHasTime('2026-10-20T14:30:00')).toBe(true);
    expect(slipHasTime('2026-10-20')).toBe(false);
    expect(slipHasTime(null)).toBe(false);
  });
});
