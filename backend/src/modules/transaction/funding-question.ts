/**
 * "Where should the money for these buys come from?" — the question shown before a
 * statement or slip is recorded. PURE: the caller passes the cash balances in.
 *
 * Per portfolio that buys something: what it buys, the cash it has to pay with (its
 * balance now plus what it sells in the same file — sells are recorded first), and
 * what's missing. `no_cash` means the whole cost has to be topped up.
 */
import { money } from '../notification/notification-messages';

export interface CashBalance {
  portfolioId: string;
  portfolioName: string;
  currency: string;
  balance: number;
}

export interface FundingQuestion {
  portfolioId: string;
  portfolioName: string;
  currency: string;
  buyAmount: number;
  /** Sold by this portfolio in the same file — cash by the time the buys are recorded. */
  sellAmount: number;
  /** Balance before the import. */
  cash: number;
  available: number;
  shortfall: number;
  kind: 'has_cash' | 'no_cash';
  /** Other portfolios with cash in this currency (incl. their sales in the file), to borrow from. */
  others: { portfolioId: string; portfolioName: string; balance: number }[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function fundingQuestions(params: {
  groups: { symbol: string; buyAmount: number; sellAmount: number; currency: string }[];
  /** symbol → the portfolio its rows go to */
  portfolioOf: Map<string, string>;
  cash: CashBalance[];
  portfolioNames: Map<string, string>;
}): FundingQuestion[] {
  const flows = new Map<string, { portfolioId: string; currency: string; buy: number; sell: number }>();
  for (const g of params.groups) {
    const portfolioId = params.portfolioOf.get(g.symbol);
    if (!portfolioId) continue;
    const k = `${portfolioId}|${g.currency}`;
    const f = flows.get(k) ?? { portfolioId, currency: g.currency, buy: 0, sell: 0 };
    f.buy += g.buyAmount;
    f.sell += g.sellAmount;
    flows.set(k, f);
  }
  const balanceOf = (portfolioId: string, currency: string) =>
    params.cash.find((c) => c.portfolioId === portfolioId && c.currency === currency)?.balance ?? 0;
  const nameOf = (portfolioId: string) =>
    params.portfolioNames.get(portfolioId) ?? params.cash.find((c) => c.portfolioId === portfolioId)?.portfolioName ?? '?';

  const questions: FundingQuestion[] = [];
  for (const f of flows.values()) {
    if (f.buy <= 0) continue;
    const cash = round2(balanceOf(f.portfolioId, f.currency));
    const available = round2(Math.max(0, cash) + f.sell);
    const shortfall = round2(Math.max(0, f.buy - available));

    const otherIds = new Set([
      ...params.cash.filter((c) => c.currency === f.currency).map((c) => c.portfolioId),
      ...[...flows.values()].filter((o) => o.currency === f.currency).map((o) => o.portfolioId),
    ]);
    otherIds.delete(f.portfolioId);
    const others = [...otherIds]
      .map((id) => {
        const flow = flows.get(`${id}|${f.currency}`);
        // What it would have left after its own buys in this file.
        const balance = round2(Math.max(0, balanceOf(id, f.currency)) + (flow?.sell ?? 0) - (flow?.buy ?? 0));
        return { portfolioId: id, portfolioName: nameOf(id), balance };
      })
      .filter((o) => o.balance > 0)
      .sort((a, b) => a.portfolioName.localeCompare(b.portfolioName));

    questions.push({
      portfolioId: f.portfolioId,
      portfolioName: nameOf(f.portfolioId),
      currency: f.currency,
      buyAmount: round2(f.buy),
      sellAmount: round2(f.sell),
      cash,
      available,
      shortfall,
      kind: available > 0 ? 'has_cash' : 'no_cash',
      others,
    });
  }
  return questions.sort((a, b) => a.portfolioName.localeCompare(b.portfolioName));
}

/** `**Fire** ซื้อรวม $229.76 · มีเงินสด $212.52 (…) · ขาด $17.24` */
export function describeFundingQuestion(q: FundingQuestion): string {
  const head = `**${q.portfolioName}** ซื้อรวม ${money(q.buyAmount, q.currency)}`;
  if (q.kind === 'no_cash') {
    return `${head} · ⚠️ ไม่มีเงินสดในพอร์ต — ต้องเติมเงิน ${money(q.shortfall, q.currency)}`;
  }
  const fromSales = q.sellAmount > 0 ? ` (รวมเงินจากการขายในไฟล์นี้ ${money(q.sellAmount, q.currency)})` : '';
  const missing = q.shortfall > 0 ? ` · ขาด ${money(q.shortfall, q.currency)}` : ' · พอจ่าย ไม่ต้องเติมเงิน';
  return `${head} · มีเงินสด ${money(q.available, q.currency)}${fromSales}${missing}`;
}
