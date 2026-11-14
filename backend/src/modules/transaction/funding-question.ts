/**
 * "Where should the money for these buys come from?" — asked before a statement or
 * slip is recorded. PURE: the caller passes the cash balances in.
 *
 * Cash is one shared pool per currency (like Dime's wallet), so there is one question
 * per currency: what the file buys, the cash available (every portfolio's balance now
 * plus what the file sells — sells are recorded first), and what's missing.
 * `no_cash` means the whole cost has to be topped up.
 */
import { money } from '../notification/notification-messages';

export interface CashBalance {
  portfolioId: string;
  portfolioName: string;
  currency: string;
  balance: number;
}

export interface FundingQuestion {
  currency: string;
  buyAmount: number;
  /** Sold in the same file — cash by the time the buys are recorded. */
  sellAmount: number;
  /** The shared pool before the import (all portfolios). */
  cash: number;
  available: number;
  shortfall: number;
  kind: 'has_cash' | 'no_cash';
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function fundingQuestions(params: {
  groups: { buyAmount: number; sellAmount: number; currency: string; symbol?: string }[];
  cash: CashBalance[];
}): FundingQuestion[] {
  const flows = new Map<string, { buy: number; sell: number }>();
  for (const g of params.groups) {
    const f = flows.get(g.currency) ?? { buy: 0, sell: 0 };
    f.buy += g.buyAmount;
    f.sell += g.sellAmount;
    flows.set(g.currency, f);
  }
  const questions: FundingQuestion[] = [];
  for (const [currency, f] of flows) {
    if (f.buy <= 0) continue;
    const cash = round2(params.cash.filter((c) => c.currency === currency).reduce((s, c) => s + Math.max(0, c.balance), 0));
    const available = round2(cash + f.sell);
    const shortfall = round2(Math.max(0, f.buy - available));
    questions.push({
      currency,
      buyAmount: round2(f.buy),
      sellAmount: round2(f.sell),
      cash,
      available,
      shortfall,
      kind: available > 0 ? 'has_cash' : 'no_cash',
    });
  }
  return questions.sort((a, b) => a.currency.localeCompare(b.currency));
}

/** `**USD** ซื้อรวม $229.76 · เงินสดกลาง $212.52 (…) · ขาด $17.24` */
export function describeFundingQuestion(q: FundingQuestion): string {
  const head = `**${q.currency}** ซื้อรวม ${money(q.buyAmount, q.currency)}`;
  if (q.kind === 'no_cash') {
    return `${head} · ⚠️ ไม่มีเงินสด — ต้องเติมเงิน ${money(q.shortfall, q.currency)}`;
  }
  const fromSales = q.sellAmount > 0 ? ` (รวมเงินจากการขายในไฟล์นี้ ${money(q.sellAmount, q.currency)})` : '';
  const missing = q.shortfall > 0 ? ` · ขาด ${money(q.shortfall, q.currency)}` : ' · พอจ่าย ไม่ต้องเติมเงิน';
  return `${head} · เงินสดกลาง ${money(q.available, q.currency)}${fromSales}${missing}`;
}
