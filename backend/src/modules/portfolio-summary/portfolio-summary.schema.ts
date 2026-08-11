import { builder } from "../../graphql/builder";
import {
  PortfolioSummaryService,
  PortfolioSummaryResponse,
  AssetSummaryDto,
} from "./portfolio-summary.service";

// --- 1. Object Types สำหรับผลลัพธ์สรุปพอร์ต (ผูกกับ TypeScript Interfaces) ---

const AssetSummaryRef = builder.objectRef<AssetSummaryDto>("AssetSummary");
AssetSummaryRef.implement({
  fields: (t) => ({
    assetSymbol: t.exposeString("assetSymbol"),
    assetName: t.exposeString("assetName"),
    quantity: t.field({
      type: "Float",
      resolve: (parent) => parent.quantity,
    }),
    avgPrice: t.field({
      type: "Float",
      resolve: (parent) => parent.avgPrice,
    }),
    currentPrice: t.field({
      type: "Float",
      resolve: (parent) => parent.currentPrice,
    }),
    currentValue: t.field({
      type: "Float",
      resolve: (parent) => parent.currentValue,
    }),
    costValue: t.field({
      type: "Float",
      resolve: (parent) => parent.costValue,
    }),
    unrealizedPL: t.field({
      type: "Float",
      resolve: (parent) => parent.unrealizedPL,
    }),
    unrealizedPLPercent: t.field({
      type: "Float",
      resolve: (parent) => parent.unrealizedPLPercent,
    }),
    realizedPL: t.field({
      type: "Float",
      resolve: (parent) => parent.realizedPL,
    }),
    totalDiv: t.field({
      type: "Float",
      resolve: (parent) => parent.totalDiv,
    }),
  }),
});

const PortfolioSummaryRef =
  builder.objectRef<PortfolioSummaryResponse>("PortfolioSummary");
PortfolioSummaryRef.implement({
  fields: (t) => ({
    totalCurrentValue: t.field({
      type: "Float",
      resolve: (parent) => parent.totalCurrentValue,
    }),
    totalCost: t.field({
      type: "Float",
      resolve: (parent) => parent.totalCost,
    }),
    totalUnrealizedPL: t.field({
      type: "Float",
      resolve: (parent) => parent.totalUnrealizedPL,
    }),
    totalUnrealizedPLPercent: t.field({
      type: "Float",
      resolve: (parent) => parent.totalUnrealizedPLPercent,
    }),
    totalRealizedPL: t.field({
      type: "Float",
      resolve: (parent) => parent.totalRealizedPL,
    }),
    totalDividend: t.field({
      type: "Float",
      resolve: (parent) => parent.totalDividend,
    }),
    netTotalProfit: t.field({
      type: "Float",
      resolve: (parent) => parent.netTotalProfit,
    }),
    holdings: t.field({
      type: [AssetSummaryRef],
      resolve: (parent) => parent.holdings,
    }),
  }),
});

// --- 2. Query สำหรับเรียกใช้งานฝั่ง Frontend ---
builder.queryFields((t) => ({
  getPortfolioSummary: t.field({
    type: PortfolioSummaryRef,
    nullable: true,
    args: {
      portfolioId: t.arg.id({ required: true }),
    },
    resolve: async (_parent, { portfolioId }, context: any) => {
      if (!context.userId) throw new Error("Unauthorized");
      return await PortfolioSummaryService.getPortfolioSummary(portfolioId);
    },
  }),
}));
