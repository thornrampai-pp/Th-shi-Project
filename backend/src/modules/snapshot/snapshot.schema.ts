import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as snapshotService from './snapshot.service';
import type { SnapshotGranularityValue } from './snapshot.service';

export const SnapshotPeriodEnum = builder.enumType('SnapshotPeriod', { values: ['DAILY', 'MONTHLY', 'YEARLY'] as const });

interface PortfolioSnapshotShape {
  id: string;
  date: Date;
  granularity: string;
  equity: unknown;
  cash: unknown;
  unrealizedPL: unknown;
  realizedPL: unknown;
  totalDividend: unknown;
  costBasis: unknown;
  netCashFlow: unknown;
  twrReturn: unknown;
}

const PortfolioSnapshotType = builder.objectRef<PortfolioSnapshotShape>('PortfolioSnapshot').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    date: t.field({ type: 'String', resolve: (s) => s.date.toISOString() }),
    granularity: t.field({ type: SnapshotPeriodEnum, resolve: (s) => s.granularity as SnapshotGranularityValue }),
    equity: t.field({ type: 'Float', resolve: (s) => Number(s.equity) }),
    cash: t.field({ type: 'Float', resolve: (s) => Number(s.cash) }),
    unrealizedPL: t.field({ type: 'Float', resolve: (s) => Number(s.unrealizedPL) }),
    realizedPL: t.field({ type: 'Float', resolve: (s) => Number(s.realizedPL) }),
    totalDividend: t.field({ type: 'Float', resolve: (s) => Number(s.totalDividend) }),
    costBasis: t.field({ type: 'Float', resolve: (s) => Number(s.costBasis) }),
    netCashFlow: t.field({ type: 'Float', resolve: (s) => Number(s.netCashFlow) }),
    twrReturn: t.field({ type: 'Float', resolve: (s) => Number(s.twrReturn) }),
  }),
});

interface PerformanceSummaryShape {
  totalReturn: number;
  twr: number;
  cagr: number;
  unrealizedPL: number;
  realizedPL: number;
  totalDividend: number;
}

const PerformanceSummaryType = builder.objectRef<PerformanceSummaryShape>('PerformanceSummary').implement({
  fields: (t) => ({
    totalReturn: t.exposeFloat('totalReturn'),
    twr: t.exposeFloat('twr'),
    cagr: t.exposeFloat('cagr'),
    unrealizedPL: t.exposeFloat('unrealizedPL'),
    realizedPL: t.exposeFloat('realizedPL'),
    totalDividend: t.exposeFloat('totalDividend'),
  }),
});

interface NetWorthSummaryShape {
  total: number;
  currency: string;
  asOf: string;
}

const NetWorthSummaryType = builder.objectRef<NetWorthSummaryShape>('NetWorthSummary').implement({
  fields: (t) => ({
    total: t.exposeFloat('total'),
    currency: t.exposeString('currency'),
    asOf: t.exposeString('asOf'),
  }),
});

interface AssetAllocationShape {
  symbol: string;
  value: number;
}

const AssetAllocationType = builder.objectRef<AssetAllocationShape>('AssetAllocation').implement({
  fields: (t) => ({
    symbol: t.exposeString('symbol'),
    value: t.exposeFloat('value'),
  }),
});

interface DashboardSummaryShape {
  currency: string;
  netWorth: number;
  portfolioValue: number;
  pl: number;
  dividendYtd: number;
  assetAllocation: AssetAllocationShape[];
}

const DashboardSummaryType = builder.objectRef<DashboardSummaryShape>('DashboardSummary').implement({
  fields: (t) => ({
    currency: t.exposeString('currency'),
    netWorth: t.exposeFloat('netWorth'),
    portfolioValue: t.exposeFloat('portfolioValue'),
    pl: t.exposeFloat('pl'),
    dividendYtd: t.exposeFloat('dividendYtd'),
    assetAllocation: t.field({ type: [AssetAllocationType], resolve: (d) => d.assetAllocation }),
  }),
});

const PriceSourceEnum = builder.enumType('PriceSource', {
  description: 'QUOTE = latest synced quote, CLOSE = stored daily close, COST = no price yet (valued at avg cost)',
  values: ['QUOTE', 'CLOSE', 'COST'] as const,
});

const HoldingType =builder.objectRef<snapshotService.HoldingSummary>('Holding').implement({
  fields: (t) => ({
    assetId: t.exposeString('assetId'),
    symbol: t.exposeString('symbol'),
    name: t.exposeString('name'),
    assetCurrency: t.exposeString('assetCurrency', { description: "The asset's trading currency" }),
    quantity: t.exposeFloat('quantity'),
    avgPrice: t.exposeFloat('avgPrice'),
    marketPrice: t.exposeFloat('marketPrice'),
    priceSource: t.field({ type: PriceSourceEnum, resolve: (h) => h.priceSource }),
    priceAsOf: t.string({
      nullable: true,
      description: 'QUOTE: when the price traded. CLOSE: the daily bar (00:00 UTC of its day). COST: null',
      resolve: (h) => h.priceAsOf?.toISOString() ?? null,
    }),
    marketValue: t.exposeFloat('marketValue'),
    costBasis: t.exposeFloat('costBasis'),
    unrealizedPL: t.exposeFloat('unrealizedPL'),
    unrealizedPLPct: t.exposeFloat('unrealizedPLPct'),
    weight: t.exposeFloat('weight', { description: 'Share of holdings market value (cash excluded), in %' }),
  }),
});

const PortfolioHoldingsType = builder
  .objectRef<snapshotService.PortfolioHoldingsSummary>('PortfolioHoldings')
  .implement({
    description: "Open positions valued now; every figure is in the portfolio's baseCurrency (`currency`)",
    fields: (t) => ({
      portfolioId: t.exposeID('portfolioId'),
      name: t.exposeString('name'),
      strategy: t.exposeString('strategy'),
      type: t.exposeString('type'),
      currency: t.exposeString('currency'),
      cash: t.exposeFloat('cash'),
      equity: t.exposeFloat('equity'),
      marketValue: t.exposeFloat('marketValue'),
      costBasis: t.exposeFloat('costBasis'),
      unrealizedPL: t.exposeFloat('unrealizedPL'),
      unrealizedPLPct: t.exposeFloat('unrealizedPLPct'),
      realizedPL: t.exposeFloat('realizedPL'),
      totalDividend: t.exposeFloat('totalDividend'),
      holdings: t.field({ type: [HoldingType], resolve: (p) => p.holdings }),
    }),
  });

type PortfolioOverviewShape = Awaited<ReturnType<typeof snapshotService.getPortfolioOverview>>;

const PortfolioOverviewType = builder.objectRef<PortfolioOverviewShape>('PortfolioOverview').implement({
  description: 'Totals are converted to `currency` (THB); each portfolio stays in its own currency',
  fields: (t) => ({
    currency: t.exposeString('currency'),
    marketValue: t.exposeFloat('marketValue'),
    costBasis: t.exposeFloat('costBasis'),
    unrealizedPL: t.exposeFloat('unrealizedPL'),
    unrealizedPLPct: t.exposeFloat('unrealizedPLPct'),
    realizedPL: t.exposeFloat('realizedPL'),
    portfolios: t.field({ type: [PortfolioHoldingsType], resolve: (o) => o.portfolios }),
  }),
});

builder.queryField('portfolioHoldings', (t) =>
  t.field({
    type: PortfolioHoldingsType,
    args: { portfolioId: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return snapshotService.getPortfolioHoldings(userId, String(args.portfolioId));
    },
  }),
);

builder.queryField('portfolioOverview', (t) =>
  t.field({
    type: PortfolioOverviewType,
    resolve: (_root, _args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return snapshotService.getPortfolioOverview(userId);
    },
  }),
);

builder.queryField('portfolioSnapshots', (t) =>
  t.field({
    type: [PortfolioSnapshotType],
    args: {
      portfolioId: t.arg.id({ required: true }),
      granularity: t.arg({ type: SnapshotPeriodEnum, required: true }),
      from: t.arg.string({ required: true }),
      to: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return snapshotService.listSnapshots(
        userId,
        String(args.portfolioId),
        args.granularity as SnapshotGranularityValue,
        new Date(args.from),
        new Date(args.to),
      );
    },
  }),
);

builder.queryField('portfolioPerformance', (t) =>
  t.field({
    type: PerformanceSummaryType,
    args: {
      portfolioId: t.arg.id({ required: true }),
      from: t.arg.string({ required: true }),
      to: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return snapshotService.getPortfolioPerformance(userId, String(args.portfolioId), new Date(args.from), new Date(args.to));
    },
  }),
);

builder.queryField('netWorth', (t) =>
  t.field({
    type: NetWorthSummaryType,
    resolve: (_root, _args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return snapshotService.getNetWorth(userId);
    },
  }),
);

builder.queryField('dashboard', (t) =>
  t.field({
    type: DashboardSummaryType,
    args: { portfolioId: t.arg.id() },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return snapshotService.getDashboard(userId, args.portfolioId ? String(args.portfolioId) : undefined);
    },
  }),
);

builder.mutationField('triggerSnapshot', (t) =>
  t.field({
    type: PortfolioSnapshotType,
    args: { portfolioId: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return snapshotService.triggerSnapshot(userId, String(args.portfolioId));
    },
  }),
);
