import { gql } from 'graphql-tag';

export const ledgerTypeDefs = gql`
  enum AccountType {
    CASH
    ASSET
  }

  enum EntrySide {
    DEBIT
    CREDIT
  }

  type LedgerEntry {
    id: ID!
    transactionId: String!
    accountType: AccountType!
    side: EntrySide!
    amount: Float!
    assetSymbol: String!
    createdAt: String!
  }

  extend type Query {
    "Read-only — every write goes through Transaction/Order mutations (Phase 5+), never through the ledger directly."
    ledgerEntries(portfolioId: ID!, from: String, to: String, accountType: AccountType): [LedgerEntry!]!
  }
`;
