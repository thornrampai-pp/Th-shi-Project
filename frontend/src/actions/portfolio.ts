"use server";

import { redirect } from "next/navigation";
import { graphql } from "@/gql";
import type { PortfolioType, RecordTransactionMutationVariables, StrategyType } from "@/gql/graphql";
import { serverQuery } from "@/lib/graphql/server";
import { run } from "./run";

const CreatePortfolioMutation = graphql(`
  mutation CreatePortfolio(
    $name: String!
    $strategy: StrategyType!
    $baseCurrency: String!
    $type: PortfolioType!
    $initialPaperBalance: Float
  ) {
    createPortfolio(
      name: $name
      strategy: $strategy
      baseCurrency: $baseCurrency
      type: $type
      initialPaperBalance: $initialPaperBalance
    ) {
      id
    }
  }
`);

const AddAssetMutation = graphql(`
  mutation AddAssetToPortfolio(
    $portfolioId: ID!
    $assetId: ID!
    $quantity: Float!
    $price: Float!
    $fee: Float
    $executedAt: String
    $fundWithDeposit: Boolean
  ) {
    createTransaction(
      portfolioId: $portfolioId
      type: BUY
      assetId: $assetId
      quantity: $quantity
      price: $price
      fee: $fee
      executedAt: $executedAt
      fundWithDeposit: $fundWithDeposit
    ) {
      id
    }
  }
`);

export type NewPortfolio = {
  name: string;
  strategy: StrategyType;
  baseCurrency: string;
  type: PortfolioType;
  initialPaperBalance?: number;
};

export async function createPortfolioAction(input: NewPortfolio) {
  let id: string | null | undefined;
  const result = await run(async () => {
    id = (await serverQuery(CreatePortfolioMutation, input)).createPortfolio?.id;
  });
  if (!result.error && id) redirect(`/portfolios/${id}`);
  return result;
}

export type NewHolding = {
  assetId: string;
  quantity: number;
  price: number;
  fee?: number;
  /** yyyy-mm-dd */
  executedOn?: string;
  fundWithDeposit: boolean;
};

/**
 * Midday UTC keeps the chosen calendar day in any timezone. For today that can still be
 * in the future, and valuation ignores future transactions — so use "now" (undefined) then.
 */
function toExecutedAt(executedOn: string | undefined): string | undefined {
  const midday = executedOn ? new Date(`${executedOn}T12:00:00.000Z`) : null;
  return midday && midday.getTime() < Date.now() ? midday.toISOString() : undefined;
}

export async function addAssetAction(portfolioId: string, input: NewHolding) {
  const { executedOn, ...rest } = input;
  return run(() => serverQuery(AddAssetMutation, { portfolioId, ...rest, executedAt: toExecutedAt(executedOn) }));
}

const CashAccountsQuery = graphql(`
  query PortfolioCashAccounts($portfolioId: ID!) {
    cashAccounts(portfolioId: $portfolioId) {
      currency
    }
  }
`);

const AddCashAccountMutation = graphql(`
  mutation AddCashAccount($portfolioId: ID!, $currency: String!, $isDomestic: Boolean) {
    addCashAccount(portfolioId: $portfolioId, currency: $currency, isDomestic: $isDomestic) {
      id
    }
  }
`);

const RecordTransactionMutation = graphql(`
  mutation RecordTransaction(
    $portfolioId: ID!
    $type: TransactionType!
    $assetId: ID
    $quantity: Float
    $price: Float
    $amount: Float
    $currency: String
    $fee: Float
    $taxWithheld: Float
    $note: String
    $executedAt: String
  ) {
    createTransaction(
      portfolioId: $portfolioId
      type: $type
      assetId: $assetId
      quantity: $quantity
      price: $price
      amount: $amount
      currency: $currency
      fee: $fee
      taxWithheld: $taxWithheld
      note: $note
      executedAt: $executedAt
    ) {
      id
    }
  }
`);

type Common = { executedOn?: string; note?: string };
export type NewTransaction = Common &
  (
    | { type: "SELL"; assetId: string; quantity: number; price: number; fee?: number }
    | { type: "DEPOSIT" | "WITHDRAW"; amount: number; currency: string }
    | { type: "DIVIDEND"; assetId: string; amount: number; currency: string; taxWithheld?: number }
  );

export async function recordTransactionAction(portfolioId: string, input: NewTransaction) {
  const { executedOn, ...rest } = input;
  return run(async () => {
    // Money arriving in a currency the portfolio has no account for opens one,
    // with the same domestic rule the backend uses for a new portfolio's account.
    if (rest.type === "DEPOSIT") {
      const { cashAccounts } = await serverQuery(CashAccountsQuery, { portfolioId });
      if (!cashAccounts?.some((c) => c?.currency === rest.currency)) {
        await serverQuery(AddCashAccountMutation, {
          portfolioId,
          currency: rest.currency,
          isDomestic: rest.currency === "THB",
        });
      }
    }
    const variables: RecordTransactionMutationVariables = {
      portfolioId,
      ...rest,
      executedAt: toExecutedAt(executedOn),
    };
    await serverQuery(RecordTransactionMutation, variables);
  });
}
