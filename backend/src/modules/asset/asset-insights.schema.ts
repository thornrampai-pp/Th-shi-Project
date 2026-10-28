import { builder } from "../../graphql/builder";
import { GraphQLContext, requireAuth } from "../../common/middlewares/auth.middleware";
import { AppError } from "../../common/errors/AppError";
import * as insightsService from "./asset-insights.service";

const AnalystTrendType = builder.objectRef<insightsService.AnalystTrend>("AnalystTrend").implement({
  description: "This month's analyst recommendations (number of analysts per rating)",
  fields: (t) => ({
    strongBuy: t.exposeInt("strongBuy"),
    buy: t.exposeInt("buy"),
    hold: t.exposeInt("hold"),
    sell: t.exposeInt("sell"),
    strongSell: t.exposeInt("strongSell"),
  }),
});

const AssetInsightsType = builder.objectRef<insightsService.AssetInsights>("AssetInsights").implement({
  description:
    "Key stats, financials, dates, analyst view and profile from Yahoo Finance (cached 6h). " +
    "Fields ending in Pct are percentages already (6.71 = 6.71%); money is in `currency`. Missing data is null.",
  fields: (t) => ({
    currency: t.exposeString("currency", { nullable: true }),
    price: t.exposeFloat("price", { nullable: true }),
    marketCap: t.exposeFloat("marketCap", { nullable: true }),
    trailingPE: t.exposeFloat("trailingPE", { nullable: true }),
    forwardPE: t.exposeFloat("forwardPE", { nullable: true }),
    priceToBook: t.exposeFloat("priceToBook", { nullable: true }),
    eps: t.exposeFloat("eps", { nullable: true, description: "Trailing 12-month EPS" }),
    dividendYieldPct: t.exposeFloat("dividendYieldPct", { nullable: true }),
    beta: t.exposeFloat("beta", { nullable: true }),

    roePct: t.exposeFloat("roePct", { nullable: true }),
    debtToEquityPct: t.exposeFloat("debtToEquityPct", { nullable: true, description: "58.9 = debt is 0.589x equity" }),
    profitMarginPct: t.exposeFloat("profitMarginPct", { nullable: true }),
    revenueGrowthPct: t.exposeFloat("revenueGrowthPct", { nullable: true, description: "Year over year, latest quarter" }),
    freeCashflow: t.exposeFloat("freeCashflow", { nullable: true }),

    nextEarningsDate: t.exposeString("nextEarningsDate", { nullable: true }),
    exDividendDate: t.exposeString("exDividendDate", { nullable: true, description: "Latest announced XD date (may be past)" }),

    targetMeanPrice: t.exposeFloat("targetMeanPrice", { nullable: true }),
    recommendation: t.exposeString("recommendation", { nullable: true, description: "e.g. strong_buy, buy, hold" }),
    analystCount: t.exposeInt("analystCount", { nullable: true }),
    analystTrend: t.field({ type: AnalystTrendType, nullable: true, resolve: (i) => i.analystTrend }),

    sector: t.exposeString("sector", { nullable: true }),
    industry: t.exposeString("industry", { nullable: true }),
    website: t.exposeString("website", { nullable: true }),
    businessSummary: t.exposeString("businessSummary", { nullable: true }),

    fetchedAt: t.exposeString("fetchedAt"),
  }),
});

builder.queryField("assetInsights", (t) =>
  t.field({
    type: AssetInsightsType,
    nullable: true,
    description: "null when Yahoo has nothing for this asset or can't be reached",
    args: { assetId: t.arg.id({ required: true }) },
    resolve: async (_root, args, context: GraphQLContext) => {
      requireAuth(context);
      try {
        return await insightsService.getAssetInsights(String(args.assetId));
      } catch (err) {
        if (err instanceof AppError) throw err;
        // Yahoo is unofficial and flaky — the page should still render without it.
        console.warn(`⚠️ Asset insights unavailable for ${args.assetId}:`, err instanceof Error ? err.message : err);
        return null;
      }
    },
  }),
);
