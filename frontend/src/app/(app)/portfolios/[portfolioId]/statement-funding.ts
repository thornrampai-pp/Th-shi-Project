// Mirrors backend/src/modules/transaction/funding-question.ts. Cash is one shared pool
// per currency, so there's one question per currency: what the statement buys vs the
// pool (every portfolio's cash now + what the file sells — sells are recorded first).

export type CashBalance = { portfolioId: string; portfolioName: string; currency: string; balance: number };

export type FundingQuestion = {
  currency: string;
  buyAmount: number;
  sellAmount: number;
  available: number;
  shortfall: number;
  kind: "has_cash" | "no_cash";
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export function fundingQuestions(params: {
  groups: { buyAmount: number; sellAmount: number; currency: string }[];
  cash: CashBalance[];
}): FundingQuestion[] {
  const flows = new Map<string, { buy: number; sell: number }>();
  for (const g of params.groups) {
    const f = flows.get(g.currency) ?? { buy: 0, sell: 0 };
    f.buy += g.buyAmount;
    f.sell += g.sellAmount;
    flows.set(g.currency, f);
  }
  const out: FundingQuestion[] = [];
  for (const [currency, f] of flows) {
    if (f.buy <= 0) continue;
    const pool = params.cash.filter((c) => c.currency === currency).reduce((s, c) => s + Math.max(0, c.balance), 0);
    const available = round2(pool + f.sell);
    out.push({
      currency,
      buyAmount: round2(f.buy),
      sellAmount: round2(f.sell),
      available,
      shortfall: round2(Math.max(0, f.buy - available)),
      kind: available > 0 ? "has_cash" : "no_cash",
    });
  }
  return out.sort((a, b) => a.currency.localeCompare(b.currency));
}
