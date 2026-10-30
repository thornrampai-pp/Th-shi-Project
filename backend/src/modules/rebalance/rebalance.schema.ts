import { builder } from "../../graphql/builder";
import { GraphQLContext, requireAuth } from "../../common/middlewares/auth.middleware";
import * as rebalanceService from "./rebalance.service";
import type { RebalanceDriftItem, RebalanceDriftReport } from "./rebalance.service";

const RebalanceDriftItemType = builder.objectRef<RebalanceDriftItem>("RebalanceDriftItem").implement({
  fields: (t) => ({
    assetId: t.exposeString("assetId"),
    symbol: t.exposeString("symbol"),
    currentWeight: t.exposeFloat("currentWeight"),
    targetWeight: t.exposeFloat("targetWeight"),
    driftPct: t.exposeFloat("driftPct"),
    marketValue: t.exposeFloat("marketValue"),
    marketPrice: t.exposeFloat("marketPrice"),
    suggestedValue: t.exposeFloat("suggestedValue"),
    suggestedQuantity: t.exposeFloat("suggestedQuantity", { nullable: true }),
  }),
});

const RebalanceDriftReportType = builder.objectRef<RebalanceDriftReport>("RebalanceDriftReport").implement({
  fields: (t) => ({
    portfolioId: t.exposeString("portfolioId"),
    currency: t.exposeString("currency"),
    totalValue: t.exposeFloat("totalValue"),
    items: t.field({ type: [RebalanceDriftItemType], resolve: (r) => r.items }),
  }),
});

interface RebalanceLogShape {
  id: string;
  portfolioId: string;
  executedAt: Date;
  totalValueBefore: unknown;
  driftBefore: unknown;
  description: string | null;
}

const RebalanceLogType = builder.objectRef<RebalanceLogShape>("RebalanceLog").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    portfolioId: t.exposeString("portfolioId"),
    executedAt: t.field({ type: "String", resolve: (log) => log.executedAt.toISOString() }),
    totalValueBefore: t.field({ type: "Float", resolve: (log) => Number(log.totalValueBefore) }),
    driftBeforeJson: t.field({ type: "String", resolve: (log) => JSON.stringify(log.driftBefore) }),
    description: t.exposeString("description", { nullable: true }),
  }),
});

builder.queryField("rebalanceDrift", (t) =>
  t.field({
    type: RebalanceDriftReportType,
    description: "Current vs. target allocation % for every position with a targetWeight set, with suggested buy/sell",
    args: { portfolioId: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return rebalanceService.getRebalanceDrift(userId, String(args.portfolioId));
    },
  }),
);

builder.queryField("rebalanceLogs", (t) =>
  t.field({
    type: [RebalanceLogType],
    args: { portfolioId: t.arg.id({ required: true }), limit: t.arg.int(), offset: t.arg.int() },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return rebalanceService.listRebalanceLogs(userId, String(args.portfolioId), {
        limit: args.limit ?? undefined,
        offset: args.offset ?? undefined,
      });
    },
  }),
);

builder.mutationField("recordRebalance", (t) =>
  t.field({
    type: RebalanceLogType,
    description: "Snapshots the current drift report into a RebalanceLog for later reference",
    args: { portfolioId: t.arg.id({ required: true }), description: t.arg.string() },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return rebalanceService.recordRebalance(userId, String(args.portfolioId), args.description ?? undefined);
    },
  }),
);
