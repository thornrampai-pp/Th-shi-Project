/**
 * Where the money for a BUY comes from. PURE — balances are passed in.
 *
 * Dime keeps one wallet per currency: THB is converted when you buy, and sale proceeds
 * or dividends stay in the wallet and pay for the next buys, whatever "portfolio" they
 * came from. tōshi stores cash per portfolio but treats it as ONE pool per currency:
 *
 *   - CASH_FIRST   the buying portfolio's own cash, then the other portfolios' cash
 *                  (largest balance first, moved over as linked transfers), and a new
 *                  deposit only for what's still missing
 *   - DEPOSIT_ALL  a new deposit for the full cost, all cash untouched
 *                  (a holding bought outside the app)
 *   - CASH_ONLY    the portfolio's own cash only; no deposit — the BUY fails if short
 */

export type FundingMode = 'CASH_FIRST' | 'DEPOSIT_ALL' | 'CASH_ONLY';

export interface FundingPlan {
  /** Paid from the buying portfolio's own cash. */
  fromCash: number;
  /** Moved in from other portfolios' cash (same currency), in the order drawn. */
  transfers: { portfolioId: string; amount: number }[];
  /** Sum of `transfers`. */
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
  /** The user's other portfolios' cash in the same currency. */
  pool?: { portfolioId: string; balance: number }[];
}): FundingPlan {
  const cost = round8(params.cost);
  if (params.mode === 'DEPOSIT_ALL') return { fromCash: 0, transfers: [], transfer: 0, deposit: cost };
  if (params.mode === 'CASH_ONLY') return { fromCash: cost, transfers: [], transfer: 0, deposit: 0 };

  const fromCash = round8(Math.min(cost, Math.max(0, round8(params.cash))));
  let missing = round8(cost - fromCash);
  const transfers: FundingPlan['transfers'] = [];
  const donors = [...(params.pool ?? [])]
    .map((p) => ({ portfolioId: p.portfolioId, balance: round8(p.balance) }))
    .filter((p) => p.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  for (const d of donors) {
    if (missing <= 0) break;
    const amount = round8(Math.min(missing, d.balance));
    transfers.push({ portfolioId: d.portfolioId, amount });
    missing = round8(missing - amount);
  }
  const transfer = round8(transfers.reduce((s, t) => s + t.amount, 0));
  return { fromCash, transfers, transfer, deposit: missing };
}
