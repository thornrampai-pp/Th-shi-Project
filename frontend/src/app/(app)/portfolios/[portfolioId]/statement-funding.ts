// Mirrors backend/src/modules/transaction/funding-question.ts: what each portfolio buys
// in a statement vs the cash it can pay with — its balance now plus what it sells in
// the same file (sells are recorded before buys).

export type FundingMode = "CASH_FIRST" | "DEPOSIT_ALL";

export type CashBalance = { portfolioId: string; portfolioName: string; currency: string; balance: number };

export type FundingQuestion = {
  /** An existing portfolio id, or `new:<name>` for one created on import. */
  key: string;
  portfolioId: string | null;
  portfolioName: string;
  currency: string;
  buyAmount: number;
  sellAmount: number;
  available: number;
  shortfall: number;
  kind: "has_cash" | "no_cash";
  others: { portfolioId: string; portfolioName: string; balance: number }[];
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export function fundingQuestions(params: {
  groups: { symbol: string; buyAmount: number; sellAmount: number; currency: string }[];
  /** symbol → portfolio key (id, or `new:<name>`) */
  target: Map<string, { key: string; portfolioId: string | null; name: string }>;
  cash: CashBalance[];
}): FundingQuestion[] {
  const flows = new Map<string, { key: string; portfolioId: string | null; name: string; currency: string; buy: number; sell: number }>();
  for (const g of params.groups) {
    const t = params.target.get(g.symbol);
    if (!t) continue;
    const k = `${t.key}|${g.currency}`;
    const f = flows.get(k) ?? { ...t, currency: g.currency, buy: 0, sell: 0 };
    f.buy += g.buyAmount;
    f.sell += g.sellAmount;
    flows.set(k, f);
  }
  const balanceOf = (portfolioId: string | null, currency: string) =>
    portfolioId ? Math.max(0, params.cash.find((c) => c.portfolioId === portfolioId && c.currency === currency)?.balance ?? 0) : 0;

  const out: FundingQuestion[] = [];
  for (const f of flows.values()) {
    if (f.buy <= 0) continue;
    const available = round2(balanceOf(f.portfolioId, f.currency) + f.sell);
    const ids = new Set(params.cash.filter((c) => c.currency === f.currency).map((c) => c.portfolioId));
    for (const o of flows.values()) if (o.portfolioId && o.currency === f.currency) ids.add(o.portfolioId);
    if (f.portfolioId) ids.delete(f.portfolioId);
    const others = [...ids]
      .map((id) => {
        const flow = flows.get(`${id}|${f.currency}`);
        const name = params.cash.find((c) => c.portfolioId === id)?.portfolioName ?? flow?.name ?? "?";
        return { portfolioId: id, portfolioName: name, balance: round2(balanceOf(id, f.currency) + (flow?.sell ?? 0) - (flow?.buy ?? 0)) };
      })
      .filter((o) => o.balance > 0)
      .sort((a, b) => a.portfolioName.localeCompare(b.portfolioName));
    out.push({
      key: f.key,
      portfolioId: f.portfolioId,
      portfolioName: f.name,
      currency: f.currency,
      buyAmount: round2(f.buy),
      sellAmount: round2(f.sell),
      available,
      shortfall: round2(Math.max(0, f.buy - available)),
      kind: available > 0 ? "has_cash" : "no_cash",
      others,
    });
  }
  return out.sort((a, b) => a.portfolioName.localeCompare(b.portfolioName));
}
