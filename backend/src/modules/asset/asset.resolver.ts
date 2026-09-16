import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as assetService from './asset.service';
import type { AssetTypeValue } from './asset.service';

interface ScreenerFilters {
  peMin?: number;
  peMax?: number;
  roeMin?: number;
  debtToEquityMax?: number;
  dividendYieldMin?: number;
  sector?: string;
  exchange?: string;
}

function numOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function serializePricePoint(row: {
  timestamp: Date;
  closePrice: unknown;
  openPrice: unknown;
  highPrice: unknown;
  lowPrice: unknown;
  volume: bigint | null;
}) {
  return {
    timestamp: row.timestamp.toISOString(),
    closePrice: Number(row.closePrice),
    openPrice: numOrNull(row.openPrice),
    highPrice: numOrNull(row.highPrice),
    lowPrice: numOrNull(row.lowPrice),
    volume: row.volume != null ? row.volume.toString() : null,
  };
}

function serializeFundamental(row: {
  id: string;
  period: string;
  year: number;
  quarter: number;
  isLatest: boolean;
  peRatio: unknown;
  pbvRatio: unknown;
  dividendYield: unknown;
  roe: unknown;
  roa: unknown;
  debtToEquity: unknown;
  currentRatio: unknown;
  revenue: unknown;
  freeCashFlow: unknown;
  revenueGrowth: unknown;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    period: row.period,
    year: row.year,
    quarter: row.quarter,
    isLatest: row.isLatest,
    peRatio: numOrNull(row.peRatio),
    pbvRatio: numOrNull(row.pbvRatio),
    dividendYield: numOrNull(row.dividendYield),
    roe: numOrNull(row.roe),
    roa: numOrNull(row.roa),
    debtToEquity: numOrNull(row.debtToEquity),
    currentRatio: numOrNull(row.currentRatio),
    revenue: numOrNull(row.revenue),
    freeCashFlow: numOrNull(row.freeCashFlow),
    revenueGrowth: numOrNull(row.revenueGrowth),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const assetResolvers = {
  Query: {
    asset: (_: unknown, args: { id: string }, context: GraphQLContext) => {
      requireAuth(context);
      return assetService.getAssetById(args.id);
    },
    assets: (
      _: unknown,
      args: { search?: string; type?: AssetTypeValue; exchange?: string; limit?: number; offset?: number },
      context: GraphQLContext,
    ) => {
      requireAuth(context);
      return assetService.listAssets(args);
    },
    assetQuote: (_: unknown, args: { symbol: string }, context: GraphQLContext) => {
      requireAuth(context);
      return assetService.getAssetQuote(args.symbol);
    },
    searchAssetSymbol: (
      _: unknown,
      args: { symbol: string; exchange?: string },
      context: GraphQLContext,
    ) => {
      requireAuth(context);
      return assetService.findOrFetchAssetBySymbol(args.symbol, args.exchange);
    },
    assetPriceHistory: async (
      _: unknown,
      args: { assetId: string; from: string; to: string },
      context: GraphQLContext,
    ) => {
      requireAuth(context);
      const rows = await assetService.getAssetPriceHistory(
        args.assetId,
        new Date(args.from),
        new Date(args.to),
      );
      return rows.map(serializePricePoint);
    },
    assetFundamentals: async (_: unknown, args: { assetId: string }, context: GraphQLContext) => {
      requireAuth(context);
      const rows = await assetService.getAssetFundamentals(args.assetId);
      return rows.map(serializeFundamental);
    },
    screenStocks: (_: unknown, args: { filters?: ScreenerFilters }, context: GraphQLContext) => {
      requireAuth(context);
      return assetService.screenStocks(args.filters ?? {});
    },
  },
  Mutation: {
    syncAssetFromYahoo: (
      _: unknown,
      args: { symbol: string; exchange?: string },
      context: GraphQLContext,
    ) => {
      requireAuth(context);
      return assetService.syncAssetFromYahoo(args.symbol, args.exchange);
    },
    refreshAssetPriceHistory: (
      _: unknown,
      args: { assetId: string; days?: number },
      context: GraphQLContext,
    ) => {
      requireAuth(context);
      return assetService.refreshAssetPriceHistory(args.assetId, args.days);
    },
    syncAssetFundamentals: async (_: unknown, args: { assetId: string }, context: GraphQLContext) => {
      requireAuth(context);
      const row = await assetService.syncAssetFundamentals(args.assetId);
      return serializeFundamental(row);
    },
  },
};
