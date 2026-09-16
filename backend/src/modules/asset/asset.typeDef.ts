import { gql } from 'graphql-tag';

export const assetTypeDefs = gql`
  enum AssetType {
    STOCK
    ETF
    CRYPTO
    FOREX
    GOLD
  }

  enum DataPeriod {
    QUARTERLY
    ANNUAL
  }

  type Asset {
    id: ID!
    symbol: String!
    name: String!
    type: AssetType!
    currency: String!
    exchange: String!
    sector: String
    industry: String
    isPopular: Boolean!
    createdAt: String!
  }

  type AssetPricePoint {
    timestamp: String!
    closePrice: Float!
    openPrice: Float
    highPrice: Float
    lowPrice: Float
    volume: String
  }

  type AssetQuote {
    symbol: String!
    price: Float
    change: Float
    changePercent: Float
    marketState: String
    asOf: String!
  }

  type AssetFundamentalData {
    id: ID!
    period: DataPeriod!
    year: Int!
    quarter: Int!
    isLatest: Boolean!
    peRatio: Float
    pbvRatio: Float
    dividendYield: Float
    roe: Float
    roa: Float
    debtToEquity: Float
    currentRatio: Float
    revenue: Float
    freeCashFlow: Float
    revenueGrowth: Float
    updatedAt: String!
  }

  input ScreenerInput {
    peMin: Float
    peMax: Float
    roeMin: Float
    debtToEquityMax: Float
    dividendYieldMin: Float
    sector: String
    exchange: String
  }

  extend type Query {
    asset(id: ID!): Asset
    assets(search: String, type: AssetType, exchange: String, limit: Int, offset: Int): [Asset!]!
    assetQuote(symbol: String!): AssetQuote!
    searchAssetSymbol(symbol: String!, exchange: String): Asset!
    assetPriceHistory(assetId: ID!, from: String!, to: String!): [AssetPricePoint!]!
    assetFundamentals(assetId: ID!): [AssetFundamentalData!]!
    screenStocks(filters: ScreenerInput): [Asset!]!
  }

  extend type Mutation {
    syncAssetFromYahoo(symbol: String!, exchange: String): Asset!
    refreshAssetPriceHistory(assetId: ID!, days: Int): Int!
    syncAssetFundamentals(assetId: ID!): AssetFundamentalData!
  }
`;
