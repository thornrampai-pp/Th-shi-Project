import { builder } from "../../graphql/builder";
import { MarketDataService } from "./market-data.service";

// --- Object Shapes & Interfaces ---

export interface AssetShape {
  id: string;
  symbol: string;
  name: string;
  type: string;
  currency: string;
  sector?: string | null;
  industry?: string | null;
}

export interface AssetPriceShape {
  id: string;
  assetId: string;
  date: Date | string;
  closePrice: number;
  openPrice?: number | null;
  highPrice?: number | null;
  lowPrice?: number | null;
  volume?: number | null;
}

export interface SyncResultShape {
  success: boolean;
  message: string;
  count: number;
}

// --- Object Types ---

const AssetRef = builder.objectRef<AssetShape>("Asset");
AssetRef.implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    symbol: t.exposeString("symbol"),
    name: t.exposeString("name"),
    type: t.exposeString("type"),
    currency: t.exposeString("currency"),
    sector: t.exposeString("sector", { nullable: true }),
    industry: t.exposeString("industry", { nullable: true }),
  }),
});

const AssetPriceRef = builder.objectRef<AssetPriceShape>("AssetPrice");
AssetPriceRef.implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    assetId: t.exposeID("assetId"),
    date: t.field({
      type: "String",
      resolve: (parent) => new Date(parent.date).toISOString().split("T")[0],
    }),
    closePrice: t.exposeFloat("closePrice"),
    openPrice: t.exposeFloat("openPrice", { nullable: true }),
    highPrice: t.exposeFloat("highPrice", { nullable: true }),
    lowPrice: t.exposeFloat("lowPrice", { nullable: true }),
    volume: t.exposeFloat("volume", { nullable: true }),
  }),
});

const SyncResultRef = builder.objectRef<SyncResultShape>("SyncResult");
SyncResultRef.implement({
  fields: (t) => ({
    success: t.exposeBoolean("success"),
    message: t.exposeString("message"),
    count: t.exposeInt("count"),
  }),
});

// --- Input Types ---

const UpsertAssetPriceInput = builder.inputType("UpsertAssetPriceInput", {
  fields: (t) => ({
    assetId: t.string({ required: true }),
    date: t.string({ required: true }), // รูปแบบ "YYYY-MM-DD"
    closePrice: t.float({ required: true }),
    openPrice: t.float({ required: false }),
    highPrice: t.float({ required: false }),
    lowPrice: t.float({ required: false }),
    volume: t.float({ required: false }),
  }),
});

// --- Queries ---

builder.queryFields((t) => ({
  searchAssets: t.field({
    type: [AssetRef],
    args: {
      keyword: t.arg.string({ required: false }),
    },
    resolve: async (_parent, { keyword }) => {
      return await MarketDataService.searchAssets(keyword ?? undefined);
    },
  }),
  getAssetPrices: t.field({
    type: [AssetPriceRef],
    args: {
      assetId: t.arg.id({ required: true }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (_parent, { assetId, limit }, context: any) => {
      if (!context.userId) throw new Error("Unauthorized");
      return await MarketDataService.getAssetPrices(assetId, limit ?? 30);
    },
  }),
}));

// --- Mutations ---
builder.mutationFields((t) => ({
  upsertAssetPrice: t.field({
    type: AssetPriceRef,
    args: {
      input: t.arg({ type: UpsertAssetPriceInput, required: true }),
    },
    resolve: async (_parent, { input }, context: any) => {
      if (!context.userId) throw new Error("Unauthorized");

      // 🌟 เปลี่ยนจาก ?? undefined เป็น ?? null ให้ตรงกับ type ที่ตั้งไว้
      return await MarketDataService.upsertAssetPrice({
        assetId: input.assetId,
        date: input.date,
        closePrice: input.closePrice,
        openPrice: input.openPrice ?? null,
        highPrice: input.highPrice ?? null,
        lowPrice: input.lowPrice ?? null,
        volume: input.volume ?? null,
      });
    },
  }),
  syncAssetPriceFromYahoo: t.field({
    type: SyncResultRef,
    args: {
      assetId: t.arg.id({ required: true }),
      symbol: t.arg.string({ required: true }),
      startDate: t.arg.string({ required: true }),
    },
    resolve: async (_parent, { assetId, symbol, startDate }, context: any) => {
      if (!context.userId) throw new Error("Unauthorized");
      return await MarketDataService.syncPriceFromYahoo(
        assetId,
        symbol,
        startDate,
      );
    },
  }),
}));
