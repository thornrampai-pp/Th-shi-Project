import { builder } from "../../graphql/builder";
import {
  GraphQLContext,
  requireAuth,
} from "../../common/middlewares/auth.middleware";

import * as assetService from "./asset.service";
import type { AssetTypeValue } from "./asset.service";
import { sourceCountryOf } from "../../common/utils/source-country.util";

function numOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

/* =========================================================
 * ENUMS
 * ========================================================= */

export const AssetTypeEnum = builder.enumType("AssetType", {
  values: ["STOCK", "ETF", "CRYPTO", "FOREX", "GOLD"] as const,
});

export const DataPeriodEnum = builder.enumType("DataPeriod", {
  values: ["QUARTERLY", "ANNUAL"] as const,
});

/* =========================================================
 * ASSET
 * ========================================================= */

interface AssetShape {
  id: string;
  symbol: string;
  name: string;
  type: string;
  currency: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
  isPopular: boolean;
  createdAt: Date;
}

export const AssetType = builder.objectRef<AssetShape>("Asset").implement({
  fields: (t) => ({
    id: t.exposeID("id"),

    symbol: t.exposeString("symbol"),

    name: t.exposeString("name"),

    type: t.field({
      type: AssetTypeEnum,
      resolve: (asset) => asset.type as AssetTypeValue,
    }),

    currency: t.exposeString("currency"),

    exchange: t.exposeString("exchange"),

    sector: t.exposeString("sector", {
      nullable: true,
    }),

    industry: t.exposeString("industry", {
      nullable: true,
    }),

    isPopular: t.exposeBoolean("isPopular"),

    // Pre-selects the tax "source country" in the UI; the user may override it.
    defaultSourceCountry: t.string({
      resolve: (asset) => sourceCountryOf(asset),
    }),

    createdAt: t.field({
      type: "String",
      resolve: (asset) => asset.createdAt.toISOString(),
    }),
  }),
});

/* =========================================================
 * ASSET PRICE HISTORY
 * ========================================================= */

interface AssetPricePointShape {
  timestamp: Date;
  closePrice: unknown;
  openPrice: unknown;
  highPrice: unknown;
  lowPrice: unknown;
  volume: bigint | null;
}

export const AssetPricePointType = builder
  .objectRef<AssetPricePointShape>("AssetPricePoint")
  .implement({
    fields: (t) => ({
      timestamp: t.field({
        type: "String",
        resolve: (price) => price.timestamp.toISOString(),
      }),

      closePrice: t.field({
        type: "Float",
        resolve: (price) => Number(price.closePrice),
      }),

      openPrice: t.field({
        type: "Float",
        nullable: true,
        resolve: (price) => numOrNull(price.openPrice),
      }),

      highPrice: t.field({
        type: "Float",
        nullable: true,
        resolve: (price) => numOrNull(price.highPrice),
      }),

      lowPrice: t.field({
        type: "Float",
        nullable: true,
        resolve: (price) => numOrNull(price.lowPrice),
      }),

      volume: t.field({
        type: "String",
        nullable: true,
        resolve: (price) =>
          price.volume != null ? price.volume.toString() : null,
      }),
    }),
  });

/* =========================================================
 * ASSET QUOTE
 * ========================================================= */

interface AssetQuoteShape {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  marketState: string | null;
  asOf: string;
}

export const AssetQuoteType = builder
  .objectRef<AssetQuoteShape>("AssetQuote")
  .implement({
    fields: (t) => ({
      symbol: t.exposeString("symbol"),

      price: t.exposeFloat("price", {
        nullable: true,
      }),

      change: t.exposeFloat("change", {
        nullable: true,
      }),

      changePercent: t.exposeFloat("changePercent", {
        nullable: true,
      }),

      marketState: t.exposeString("marketState", {
        nullable: true,
      }),

      asOf: t.exposeString("asOf"),
    }),
  });

/* =========================================================
 * FUNDAMENTALS
 * ========================================================= */

interface AssetFundamentalShape {
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
}

export const AssetFundamentalDataType = builder
  .objectRef<AssetFundamentalShape>("AssetFundamentalData")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),

      period: t.field({
        type: DataPeriodEnum,
        resolve: (fundamental) => fundamental.period as "QUARTERLY" | "ANNUAL",
      }),

      year: t.exposeInt("year"),

      quarter: t.exposeInt("quarter"),

      isLatest: t.exposeBoolean("isLatest"),

      peRatio: t.field({
        type: "Float",
        nullable: true,
        resolve: (fundamental) => numOrNull(fundamental.peRatio),
      }),

      pbvRatio: t.field({
        type: "Float",
        nullable: true,
        resolve: (fundamental) => numOrNull(fundamental.pbvRatio),
      }),

      dividendYield: t.field({
        type: "Float",
        nullable: true,
        resolve: (fundamental) => numOrNull(fundamental.dividendYield),
      }),

      roe: t.field({
        type: "Float",
        nullable: true,
        resolve: (fundamental) => numOrNull(fundamental.roe),
      }),

      roa: t.field({
        type: "Float",
        nullable: true,
        resolve: (fundamental) => numOrNull(fundamental.roa),
      }),

      debtToEquity: t.field({
        type: "Float",
        nullable: true,
        resolve: (fundamental) => numOrNull(fundamental.debtToEquity),
      }),

      currentRatio: t.field({
        type: "Float",
        nullable: true,
        resolve: (fundamental) => numOrNull(fundamental.currentRatio),
      }),

      revenue: t.field({
        type: "Float",
        nullable: true,
        resolve: (fundamental) => numOrNull(fundamental.revenue),
      }),

      freeCashFlow: t.field({
        type: "Float",
        nullable: true,
        resolve: (fundamental) => numOrNull(fundamental.freeCashFlow),
      }),

      revenueGrowth: t.field({
        type: "Float",
        nullable: true,
        resolve: (fundamental) => numOrNull(fundamental.revenueGrowth),
      }),

      updatedAt: t.field({
        type: "String",
        resolve: (fundamental) => fundamental.updatedAt.toISOString(),
      }),
    }),
  });

/* =========================================================
 * SCREENER INPUT
 * ========================================================= */

export const ScreenerInput = builder.inputType("ScreenerInput", {
  fields: (t) => ({
    peMin: t.field({
      type: "Float",
      required: false,
    }),

    peMax: t.field({
      type: "Float",
      required: false,
    }),

    roeMin: t.field({
      type: "Float",
      required: false,
    }),

    debtToEquityMax: t.field({
      type: "Float",
      required: false,
    }),

    dividendYieldMin: t.field({
      type: "Float",
      required: false,
    }),

    sector: t.string({
      required: false,
    }),

    exchange: t.string({
      required: false,
    }),
  }),
});

/* =========================================================
 * QUERIES
 * ========================================================= */

/**
 * Get asset by ID
 */
builder.queryField("asset", (t) =>
  t.field({
    type: AssetType,
    nullable: true,

    args: {
      id: t.arg.id({
        required: true,
      }),
    },

    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);

      return assetService.getAssetById(String(args.id));
    },
  }),
);

/**
 * List assets
 */
builder.queryField("assets", (t) =>
  t.field({
    type: [AssetType],

    args: {
      search: t.arg.string(),

      type: t.arg({
        type: AssetTypeEnum,
      }),

      exchange: t.arg.string(),

      limit: t.arg.int(),

      offset: t.arg.int(),
    },

    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);

      return assetService.listAssets({
        search: args.search ?? undefined,

        type: (args.type as AssetTypeValue) ?? undefined,

        exchange: args.exchange ?? undefined,

        limit: args.limit ?? undefined,

        offset: args.offset ?? undefined,
      });
    },
  }),
);

/**
 * Get real-time quote
 */
builder.queryField("assetQuote", (t) =>
  t.field({
    type: AssetQuoteType,

    args: {
      symbol: t.arg.string({
        required: true,
      }),
    },

    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);

      return assetService.getAssetQuote(args.symbol);
    },
  }),
);

/**
 * Search asset symbol
 *
 * DB first
 * ↓
 * Yahoo fallback
 * ↓
 * Save to DB
 */
builder.queryField("searchAssetSymbol", (t) =>
  t.field({
    type: AssetType,

    args: {
      symbol: t.arg.string({
        required: true,
      }),

      exchange: t.arg.string(),
    },

    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);

      return assetService.findOrFetchAssetBySymbol(
        args.symbol,
        args.exchange ?? undefined,
      );
    },
  }),
);

/**
 * Price history
 */
builder.queryField("assetPriceHistory", (t) =>
  t.field({
    type: [AssetPricePointType],

    args: {
      assetId: t.arg.id({
        required: true,
      }),

      from: t.arg.string({
        required: true,
      }),

      to: t.arg.string({
        required: true,
      }),

      limit: t.arg.int(),
      offset: t.arg.int(),
    },

    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);

      return assetService.getAssetPriceHistory(
        String(args.assetId),
        new Date(args.from),
        new Date(args.to),
        { limit: args.limit ?? undefined, offset: args.offset ?? undefined },
      );
    },
  }),
);

/**
 * Fundamentals
 */
builder.queryField("assetFundamentals", (t) =>
  t.field({
    type: [AssetFundamentalDataType],

    args: {
      assetId: t.arg.id({
        required: true,
      }),
    },

    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);

      return assetService.getAssetFundamentals(String(args.assetId));
    },
  }),
);

/**
 * Stock screener
 */
builder.queryField("screenStocks", (t) =>
  t.field({
    type: [AssetType],

    args: {
      filters: t.arg({
        type: ScreenerInput,
      }),
    },

    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);

      const filters = args.filters;

      return assetService.screenStocks({
        peMin: filters?.peMin ?? undefined,
        peMax: filters?.peMax ?? undefined,
        roeMin: filters?.roeMin ?? undefined,
        debtToEquityMax: filters?.debtToEquityMax ?? undefined,
        dividendYieldMin: filters?.dividendYieldMin ?? undefined,
        sector: filters?.sector ?? undefined,
        exchange: filters?.exchange ?? undefined,
      });
    },
  }),
);

/* =========================================================
 * MUTATIONS
 * ========================================================= */

/**
 * Sync one asset from Yahoo
 */
builder.mutationField("syncAssetFromYahoo", (t) =>
  t.field({
    type: AssetType,

    args: {
      symbol: t.arg.string({
        required: true,
      }),

      exchange: t.arg.string(),
    },

    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);

      return assetService.syncAssetFromYahoo(
        args.symbol,
        args.exchange ?? undefined,
      );
    },
  }),
);

/**
 * Refresh historical price
 */
builder.mutationField("refreshAssetPriceHistory", (t) =>
  t.field({
    type: "Int",

    args: {
      assetId: t.arg.id({
        required: true,
      }),

      days: t.arg.int(),
    },

    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);

      return assetService.refreshAssetPriceHistory(
        String(args.assetId),
        args.days ?? undefined,
      );
    },
  }),
);

/**
 * Sync fundamentals
 */
builder.mutationField("syncAssetFundamentals", (t) =>
  t.field({
    type: AssetFundamentalDataType,

    args: {
      assetId: t.arg.id({
        required: true,
      }),
    },

    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);

      return assetService.syncAssetFundamentals(String(args.assetId));
    },
  }),
);
