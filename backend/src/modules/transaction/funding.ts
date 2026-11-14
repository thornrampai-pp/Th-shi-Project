/**
 * Where the money for a BUY comes from. PURE — balances are passed in.
 *
 * Dime keeps one USD wallet: THB is converted when you buy, and sale proceeds or
 * dividends stay in the wallet and pay for the next buys. tōshi keeps cash per
 * portfolio, so a buy can be paid from:
 *
 *   - CASH_FIRST   the portfolio's own cash first, then (optionally) another
 *                  portfolio's cash, and a new deposit only for what's still missing
 *   - DEPOSIT_ALL  a new deposit for the full cost, existing cash untouched
 *                  (a holding bought outside the app)
 *   - CASH_ONLY    existing cash only; no deposit — the BUY fails if it's short
 */

export type FundingMode = 'CASH_FIRST' | 'DEPOSIT_ALL' | 'CASH_ONLY';

export interface FundingPlan {
  /** Paid from the buying portfolio's own cash. */
  fromCash: number;
  /** Moved in from another portfolio's cash (same currency). */
  transfer: number;
  /** New money deposited (THB converted by the broker). */
  deposit: number;
}

const round8 = (v: number) => Math.round(v * 1e8) / 1e8;

export function planFunding(params: {
  mode: FundingMode;
  cost: number;
  /** Cash in the buying portfolio, in the buy's currency, before this buy. */
  cash: number;
  /** Cash available in the portfolio to borrow from, when one is named. */
  otherCash?: number;
}): FundingPlan {
  const cost = round8(params.cost);
  if (params.mode === 'DEPOSIT_ALL') return { fromCash: 0, transfer: 0, deposit: cost };
  if (params.mode === 'CASH_ONLY') return { fromCash: cost, transfer: 0, deposit: 0 };

  const fromCash = round8(Math.min(cost, Math.max(0, round8(params.cash))));
  let missing = round8(cost - fromCash);
  const transfer = round8(Math.min(missing, Math.max(0, round8(params.otherCash ?? 0))));
  missing = round8(missing - transfer);
  return { fromCash, transfer, deposit: missing };
}
