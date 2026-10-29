import type { SlipExtraction, SlipTransactionType } from '../../common/integrations/gemini.util';

/** Candidates are fetched this far either side of the slip; the day rule below then narrows it. */
export const SLIP_DATE_TOLERANCE_MS = 36 * 60 * 60 * 1000;
/** When both sides carry a real time of day, they must agree this closely. */
export const SLIP_TIME_TOLERANCE_MS = 5 * 60 * 1000;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Same-currency amounts must agree to the satang/cent. */
const EXACT_AMOUNT_TOLERANCE = 0.01;
/** Cross-currency (via the transaction's stored FX rate) — rounding on either side. */
const CONVERTED_AMOUNT_TOLERANCE = 0.005;
const QUANTITY_TOLERANCE = 1e-8;
/** A unit price further apart than this is worth a second look. */
const PRICE_TOLERANCE = 0.001;

const SLIP_TYPE_TO_TX_TYPES: Record<SlipTransactionType, string[]> = {
  BUY: ['BUY'],
  SELL: ['SELL'],
  EXCHANGE: ['DEPOSIT', 'WITHDRAW', 'REPATRIATION'],
};

export interface SlipMatchCandidate {
  id: string;
  type: string;
  executedAt: Date;
  /** executedAt has a real time of day; otherwise only its (Bangkok) day means anything. */
  timeKnown: boolean;
  baseCurrAmount: number | null;
  /** Rate from `currency` to THB at execution, as stored on the transaction. */
  exchangeRate: number | null;
  /** Cash account currency (metadata.currency). */
  currency: string | null;
  /** REPATRIATION only — the foreign side. */
  sourceAmount: number | null;
  sourceCurrency: string | null;
  /** Symbol of mainAsset, when the transaction has one. */
  assetSymbol: string | null;
  quantity: number | null;
  price: number | null;
  fee: number | null;
  note: string | null;
}

export type SlipMatchResult =
  | { status: 'matched'; candidate: SlipMatchCandidate; isAmountMatched: boolean }
  | { status: 'not_found' }
  | { status: 'ambiguous'; candidates: SlipMatchCandidate[] };

interface ScoredCandidate {
  candidate: SlipMatchCandidate;
  score: number;
  exactAmount: boolean;
  dateDistance: number;
}

/**
 * Picks the one transaction a slip belongs to — or none, so a new one can be recorded.
 * Repeat buys (DCA) look alike, so the rules lean towards "different trade":
 *
 * - When: same Bangkok day; and when both sides have a real time, within 5 minutes.
 * - What: a different asset symbol or quantity rules a candidate out.
 * - Qualifies on a matching amount (same currency exactly, or via its stored FX rate
 *   when the symbol agrees), or on symbol + quantity both agreeing — the amount may
 *   then differ by a fee typed differently, which the caller flags.
 * - A note carrying the slip's transRef wins outright, whatever the date.
 *
 * Several equally good candidates are only told apart by a time match; otherwise the
 * result is ambiguous and the user picks, since this attaches a financial record.
 */
export function matchSlipToTransaction(extracted: SlipExtraction, candidates: SlipMatchCandidate[]): SlipMatchResult {
  const slipDate = parseSlipDate(extracted.transactionDate);
  const slipTimed = slipHasTime(extracted.transactionDate);
  const scored: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    const refMatch = extracted.transRef != null && (candidate.note ?? '').includes(extracted.transRef);
    const dateDistance = slipDate ? Math.abs(candidate.executedAt.getTime() - slipDate.getTime()) : 0;

    if (!refMatch) {
      if (slipDate && !sameTime(slipDate, slipTimed, candidate)) continue;
      if (assetConflicts(extracted, candidate)) continue;
    }

    const symbolMatch = extracted.assetSymbol != null && candidateSymbols(candidate).includes(baseSymbol(extracted.assetSymbol));
    const quantityMatch =
      extracted.quantity != null &&
      candidate.quantity != null &&
      Math.abs(extracted.quantity - candidate.quantity) < QUANTITY_TOLERANCE;
    const amount = amountMatch(extracted, candidate, symbolMatch);
    if (!refMatch && amount === 'none' && !(symbolMatch && quantityMatch)) continue;

    const typeMatch =
      extracted.transactionType != null && SLIP_TYPE_TO_TX_TYPES[extracted.transactionType].includes(candidate.type);

    const score =
      (refMatch ? 100 : 0) +
      (amount === 'exact' ? 50 : amount === 'converted' ? 20 : 0) +
      (symbolMatch ? 10 : 0) +
      (quantityMatch ? 10 : 0) +
      (typeMatch ? 5 : 0);

    scored.push({ candidate, score, exactAmount: amount === 'exact', dateDistance });
  }

  scored.sort((a, b) => b.score - a.score || a.dateDistance - b.dateDistance);
  const [best] = scored;
  if (!best) return { status: 'not_found' };

  const tied = scored.filter((s) => s.score === best.score);
  if (tied.length === 1) return { status: 'matched', candidate: best.candidate, isAmountMatched: best.exactAmount };

  // Only a real time of day can tell repeat trades apart; a date-only row's time is noise.
  const timed = slipTimed ? tied.filter((s) => s.candidate.timeKnown) : [];
  const [closest, next] = timed;
  if (closest && (!next || closest.dateDistance < next.dateDistance)) {
    return { status: 'matched', candidate: closest.candidate, isAmountMatched: closest.exactAmount };
  }
  return { status: 'ambiguous', candidates: tied.map((s) => s.candidate) };
}

/**
 * Where a matched slip and its transaction disagree. Broker documents win over typed
 * entries, but nothing is overwritten — these are shown so the user can check.
 */
export function slipDifferences(extracted: SlipExtraction, candidate: SlipMatchCandidate, isAmountMatched: boolean): string[] {
  const differences: string[] = [];
  if (!isAmountMatched) differences.push('ยอดเงินไม่ตรงเป๊ะ');
  const slipFee = extracted.fee != null ? extracted.fee + (extracted.vat ?? 0) : null;
  if (slipFee != null && candidate.fee != null && Math.abs(slipFee - candidate.fee) >= EXACT_AMOUNT_TOLERANCE) {
    differences.push(`ค่าธรรมเนียมในสลิป ${slipFee} แต่ในรายการ ${candidate.fee}`);
  }
  if (
    extracted.price != null &&
    candidate.price != null &&
    Math.abs(extracted.price - candidate.price) / candidate.price > PRICE_TOLERANCE
  ) {
    differences.push(`ราคาในสลิป ${extracted.price} แต่ในรายการ ${candidate.price}`);
  }
  return differences;
}

function sameTime(slipDate: Date, slipTimed: boolean, candidate: SlipMatchCandidate): boolean {
  if (slipTimed && candidate.timeKnown) {
    return Math.abs(candidate.executedAt.getTime() - slipDate.getTime()) <= SLIP_TIME_TOLERANCE_MS;
  }
  return bangkokDay(candidate.executedAt) === bangkokDay(slipDate);
}

/** Both name an asset (or both a quantity) and they differ — a different trade. */
function assetConflicts(extracted: SlipExtraction, candidate: SlipMatchCandidate): boolean {
  if (extracted.assetSymbol && candidate.assetSymbol && baseSymbol(extracted.assetSymbol) !== baseSymbol(candidate.assetSymbol)) {
    return true;
  }
  return (
    extracted.quantity != null &&
    candidate.quantity != null &&
    Math.abs(extracted.quantity - candidate.quantity) >= QUANTITY_TOLERANCE
  );
}

function amountMatch(
  extracted: SlipExtraction,
  candidate: SlipMatchCandidate,
  symbolMatch: boolean,
): 'exact' | 'converted' | 'none' {
  const slipCurrency = extracted.currency ?? 'THB';
  const slipAmounts: [number, string][] = [];
  if (extracted.amount != null) slipAmounts.push([extracted.amount, slipCurrency]);
  if (extracted.netAmount != null) slipAmounts.push([extracted.netAmount, slipCurrency]);
  if (extracted.targetAmount != null) {
    slipAmounts.push([extracted.targetAmount, extracted.targetCurrency ?? slipCurrency]);
  }

  const txAmounts: [number, string][] = [];
  if (candidate.baseCurrAmount != null && candidate.currency) {
    txAmounts.push([candidate.baseCurrAmount, candidate.currency]);
  }
  if (candidate.sourceAmount != null && candidate.sourceCurrency) {
    txAmounts.push([candidate.sourceAmount, candidate.sourceCurrency]);
  }

  for (const [slipAmount, slipCur] of slipAmounts) {
    for (const [txAmount, txCur] of txAmounts) {
      if (slipCur === txCur.toUpperCase() && Math.abs(slipAmount - txAmount) < EXACT_AMOUNT_TOLERANCE) {
        return 'exact';
      }
    }
  }

  // e.g. a THB slip paying for a USD BUY — only trusted when the symbol agrees too.
  if (symbolMatch && candidate.exchangeRate != null && candidate.baseCurrAmount != null && extracted.amount != null) {
    if (slipCurrency === 'THB' && candidate.currency?.toUpperCase() !== 'THB') {
      const expectedThb = candidate.baseCurrAmount * candidate.exchangeRate;
      if (expectedThb > 0 && Math.abs(expectedThb - extracted.amount) / expectedThb <= CONVERTED_AMOUNT_TOLERANCE) {
        return 'converted';
      }
    }
  }

  return 'none';
}

function candidateSymbols(candidate: SlipMatchCandidate): string[] {
  return [candidate.assetSymbol, candidate.currency, candidate.sourceCurrency]
    .filter((s): s is string => !!s)
    .map(baseSymbol);
}

/** "PTT.BK" and "PTT" are the same stock — slips rarely print the exchange suffix. */
export function baseSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().split('.')[0]!;
}

/** yyyy-mm-dd of the instant in Bangkok. */
export function bangkokDay(date: Date): string {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Slips are Thai unless they say otherwise: a timestamp without an offset is read as
 * +07:00, and a bare date as midday Bangkok so the tolerance window covers that day.
 */
export function parseSlipDate(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  let iso = trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    iso = `${trimmed}T12:00:00+07:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(trimmed)) {
    iso = `${trimmed}+07:00`;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The slip printed a time of day, not just a date. */
export function slipHasTime(value: string | null): boolean {
  return value != null && parseSlipDate(value) != null && !/^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}
