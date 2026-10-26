import { describe, it, expect } from 'vitest';
import type { SlipExtraction } from '../../common/integrations/gemini.util';
import { matchSlipToTransaction, parseSlipDate } from './slip-matcher';
import type { SlipMatchCandidate } from './slip-matcher';

function slip(overrides: Partial<SlipExtraction> = {}): SlipExtraction {
  return {
    amount: 200.85,
    currency: 'THB',
    transactionDate: '2026-10-20T14:30:00+07:00',
    transRef: 'ABC123',
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
    baseCurrAmount: 200.85,
    exchangeRate: null,
    currency: 'THB',
    sourceAmount: null,
    sourceCurrency: null,
    assetSymbol: null,
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

  it('breaks a score tie by closeness to the slip date', () => {
    const r = matchSlipToTransaction(slip(), [
      tx({ id: 'far', executedAt: new Date('2026-10-21T05:00:00Z') }),
      tx({ id: 'near', executedAt: new Date('2026-10-20T07:31:00Z') }),
    ]);
    expect(r).toMatchObject({ status: 'matched', candidate: { id: 'near' } });
  });

  it('reports a tie as ambiguous when the slip has no date', () => {
    const r = matchSlipToTransaction(slip({ transactionDate: null }), [tx({ id: 'a' }), tx({ id: 'b' })]);
    expect(r.status).toBe('ambiguous');
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
});
