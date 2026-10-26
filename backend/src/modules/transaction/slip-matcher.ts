import type { SlipExtraction, SlipTransactionType } from '../../common/integrations/gemini.util';

/** How far a transaction's executedAt may be from the slip's date and still match. */
export const SLIP_DATE_TOLERANCE_MS = 36 * 60 * 60 * 1000;

/** Same-currency amounts must agree to the satang/cent. */
const EXACT_AMOUNT_TOLERANCE = 0.01;
/** Cross-currency (via the transaction's stored FX rate) — rounding on either side. */
const CONVERTED_AMOUNT_TOLERANCE = 0.005;

const SLIP_TYPE_TO_TX_TYPES: Record<SlipTransactionType, string[]> = {
  BUY: ['BUY'],
  SELL: ['SELL'],
  EXCHANGE: ['DEPOSIT', 'WITHDRAW', 'REPATRIATION'],
};

export interface SlipMatchCandidate {
  id: string;
  type: string;
  executedAt: Date;
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
 * Picks the one transaction a slip belongs to. A candidate qualifies when its amount
 * matches the slip (same currency exactly, or via its stored FX rate when the asset
 * symbol also agrees) and it falls inside the date window — or when its note carries
 * the slip's transRef, which wins outright. Asset symbol and type only rank.
 *
 * Ties are broken by closeness to the slip's date; with no date to go on, a tie is
 * reported as ambiguous rather than guessed, since this attaches a financial record.
 */
export function matchSlipToTransaction(extracted: SlipExtraction, candidates: SlipMatchCandidate[]): SlipMatchResult {
  const slipDate = parseSlipDate(extracted.transactionDate);
  const scored: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    const refMatch = extracted.transRef != null && (candidate.note ?? '').includes(extracted.transRef);
    const dateDistance = slipDate ? Math.abs(candidate.executedAt.getTime() - slipDate.getTime()) : 0;
    if (!refMatch && dateDistance > SLIP_DATE_TOLERANCE_MS) continue;

    const symbolMatch = extracted.assetSymbol != null && candidateSymbols(candidate).includes(extracted.assetSymbol);
    const amount = amountMatch(extracted, candidate, symbolMatch);
    if (!refMatch && amount === 'none') continue;

    const typeMatch =
      extracted.transactionType != null && SLIP_TYPE_TO_TX_TYPES[extracted.transactionType].includes(candidate.type);

    const score =
      (refMatch ? 100 : 0) +
      (amount === 'exact' ? 50 : amount === 'converted' ? 20 : 0) +
      (symbolMatch ? 10 : 0) +
      (typeMatch ? 5 : 0);

    scored.push({ candidate, score, exactAmount: amount === 'exact', dateDistance });
  }

  scored.sort((a, b) => b.score - a.score || a.dateDistance - b.dateDistance);
  const [best, runnerUp] = scored;
  if (!best) return { status: 'not_found' };

  if (runnerUp && runnerUp.score === best.score && (!slipDate || runnerUp.dateDistance === best.dateDistance)) {
    return {
      status: 'ambiguous',
      candidates: scored.filter((s) => s.score === best.score).map((s) => s.candidate),
    };
  }

  return { status: 'matched', candidate: best.candidate, isAmountMatched: best.exactAmount };
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
    .map((s) => s.toUpperCase());
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
