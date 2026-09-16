import { gql } from 'graphql-tag';

export const portfolioTypeDefs = gql`
  enum StrategyType {
    VALUE
    GROWTH
    DIVIDEND
    TRADING
    QUANT_ALGO
  }

  enum PortfolioType {
    REAL
    PAPER
  }

  type Tag {
    id: ID!
    name: String!
    color: String!
  }

  type CashAccount {
    id: ID!
    currency: String!
    balance: Float!
    isDomestic: Boolean!
    updatedAt: String!
  }

  type Portfolio {
    id: ID!
    name: String!
    description: String
    imageUrl: String
    strategy: StrategyType!
    baseCurrency: String!
    isMargin: Boolean!
    type: PortfolioType!
    initialPaperBalance: Float
    paperSlippageBps: Int
    paperCommissionRate: Float
    createdAt: String!
    cashAccounts: [CashAccount!]!
    tags: [Tag!]!
  }

  extend type Query {
    portfolio(id: ID!): Portfolio
    myPortfolios(type: PortfolioType): [Portfolio!]!
    cashAccounts(portfolioId: ID!): [CashAccount!]!
    tags: [Tag!]!
  }

  extend type Mutation {
    createPortfolio(
      name: String!
      strategy: StrategyType!
      baseCurrency: String!
      type: PortfolioType!
      isMargin: Boolean
      initialPaperBalance: Float
    ): Portfolio!

    updatePortfolio(id: ID!, name: String, description: String, imageUrl: String, strategy: StrategyType): Portfolio!
    deletePortfolio(id: ID!): Boolean!

    addCashAccount(portfolioId: ID!, currency: String!, isDomestic: Boolean): CashAccount!

    createTag(name: String!, color: String): Tag!
    tagPortfolio(portfolioId: ID!, tagId: ID!): Portfolio!
  }
`;
