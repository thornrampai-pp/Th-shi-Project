import "server-only";
import { cache } from "react";
import { graphql } from "@/gql";
import type { PortfolioHoldingsFieldsFragment } from "@/gql/graphql";
import { compact } from "@/lib/graphql/normalize";
import { GraphQLRequestError, serverQuery } from "@/lib/graphql/server";

// Registered for codegen; the client preset inlines it into the queries below.
graphql(`
  fragment PortfolioHoldingsFields on PortfolioHoldings {
    portfolioId
    name
    strategy
    type
    currency
    cash
    equity
    marketValue
    costBasis
    unrealizedPL
    unrealizedPLPct
    realizedPL
    holdings {
      assetId
      symbol
      name
      quantity
      avgPrice
      marketPrice
      marketValue
      costBasis
      unrealizedPL
      unrealizedPLPct
      weight
    }
  }
`);

const PortfolioOverviewQuery = graphql(`
  query PortfolioOverview {
    portfolioOverview {
      currency
      marketValue
      costBasis
      unrealizedPL
      unrealizedPLPct
      realizedPL
      portfolios {
        ...PortfolioHoldingsFields
      }
    }
  }
`);

const PortfolioListQuery = graphql(`
  query PortfolioList {
    myPortfolios {
      id
      name
      type
      createdAt
    }
  }
`);

const PortfolioHoldingsQuery = graphql(`
  query PortfolioHoldings($portfolioId: ID!) {
    portfolioHoldings(portfolioId: $portfolioId) {
      ...PortfolioHoldingsFields
    }
  }
`);

function toPortfolio(p: PortfolioHoldingsFieldsFragment | null | undefined) {
  if (!p?.portfolioId) return null;
  return {
    id: p.portfolioId,
    name: p.name ?? "Untitled",
    strategy: p.strategy ?? "",
    type: p.type ?? "REAL",
    currency: p.currency ?? "THB",
    cash: p.cash ?? 0,
    equity: p.equity ?? 0,
    marketValue: p.marketValue ?? 0,
    costBasis: p.costBasis ?? 0,
    unrealizedPL: p.unrealizedPL ?? 0,
    unrealizedPLPct: p.unrealizedPLPct ?? 0,
    realizedPL: p.realizedPL ?? 0,
    holdings: compact(p.holdings).flatMap((h) =>
      h.assetId && h.symbol
        ? [
            {
              assetId: h.assetId,
              symbol: h.symbol,
              name: h.name ?? h.symbol,
              quantity: h.quantity ?? 0,
              avgPrice: h.avgPrice ?? 0,
              marketPrice: h.marketPrice ?? 0,
              marketValue: h.marketValue ?? 0,
              costBasis: h.costBasis ?? 0,
              unrealizedPL: h.unrealizedPL ?? 0,
              unrealizedPLPct: h.unrealizedPLPct ?? 0,
              weight: h.weight ?? 0,
            },
          ]
        : [],
    ),
  };
}

export type Portfolio = NonNullable<ReturnType<typeof toPortfolio>>;
export type Holding = Portfolio["holdings"][number];

/** Every portfolio (oldest first) plus totals converted to THB. */
export const getPortfolioOverview = cache(async () => {
  const { portfolioOverview: o } = await serverQuery(PortfolioOverviewQuery);
  return {
    currency: o?.currency ?? "THB",
    marketValue: o?.marketValue ?? 0,
    costBasis: o?.costBasis ?? 0,
    unrealizedPL: o?.unrealizedPL ?? 0,
    unrealizedPLPct: o?.unrealizedPLPct ?? 0,
    realizedPL: o?.realizedPL ?? 0,
    portfolios: compact(o?.portfolios?.map(toPortfolio)),
  };
});

/** Names only, oldest first — for navigation, without valuing anything. */
export const getPortfolioList = cache(async () => {
  const { myPortfolios } = await serverQuery(PortfolioListQuery);
  return compact(myPortfolios)
    .flatMap((p) => (p.id ? [{ id: p.id, name: p.name ?? "Untitled", type: p.type ?? "REAL", createdAt: p.createdAt ?? "" }] : []))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
});

export const getPortfolio = cache(async (portfolioId: string) => {
  const { portfolioHoldings } = await serverQuery(PortfolioHoldingsQuery, { portfolioId });
  return toPortfolio(portfolioHoldings);
});

const PortfolioTransactionsQuery = graphql(`
  query PortfolioTransactions($portfolioId: ID!) {
    transactions(portfolioId: $portfolioId, limit: 200) {
      id
      type
      executedAt
      assetSymbol
      mainAssetId
      mainQuantity
      mainPrice
      baseCurrAmount
      currency
      fee
      taxWithheld
      realizedPL
      note
      hasSlip
    }
    cashAccounts(portfolioId: $portfolioId) {
      id
      currency
      balance
      isDomestic
    }
  }
`);

/** Newest 200 transactions (newest first) and the cash accounts they move. */
export const getTransactions = cache(async (portfolioId: string) => {
  const { transactions, cashAccounts } = await serverQuery(PortfolioTransactionsQuery, { portfolioId });
  return {
    transactions: compact(transactions).flatMap((t) =>
      t.id && t.type
        ? [
            {
              id: t.id,
              type: t.type,
              executedAt: t.executedAt ?? "",
              assetSymbol: t.assetSymbol ?? null,
              assetId: t.mainAssetId ?? null,
              quantity: t.mainQuantity ?? null,
              price: t.mainPrice ?? null,
              amount: t.baseCurrAmount ?? null,
              currency: t.currency ?? null,
              fee: t.fee ?? 0,
              taxWithheld: t.taxWithheld ?? 0,
              realizedPL: t.realizedPL ?? null,
              note: t.note ?? null,
              hasSlip: t.hasSlip ?? false,
            },
          ]
        : [],
    ),
    cashAccounts: compact(cashAccounts).flatMap((c) =>
      c.id && c.currency ? [{ id: c.id, currency: c.currency, balance: c.balance ?? 0, isDomestic: !!c.isDomestic }] : [],
    ),
  };
});

export type Transaction = Awaited<ReturnType<typeof getTransactions>>["transactions"][number];
export type CashAccount = Awaited<ReturnType<typeof getTransactions>>["cashAccounts"][number];

/** getPortfolio, but null when it doesn't exist or isn't the user's (doesn't reveal which). */
export async function loadPortfolio(portfolioId: string) {
  try {
    return await getPortfolio(portfolioId);
  } catch (e) {
    if (e instanceof GraphQLRequestError) return null;
    throw e;
  }
}
