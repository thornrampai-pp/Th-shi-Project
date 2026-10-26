import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as portfolioService from './portfolio.service';
import type { PortfolioTypeValue, StrategyTypeValue } from './portfolio.service';

export const StrategyTypeEnum = builder.enumType('StrategyType', {
  values: ['VALUE', 'GROWTH', 'DIVIDEND', 'TRADING', 'QUANT_ALGO'] as const,
});

export const PortfolioTypeEnum = builder.enumType('PortfolioType', { values: ['REAL', 'PAPER'] as const });

interface TagShape {
  id: string;
  name: string;
  color: string;
}

const TagType = builder.objectRef<TagShape>('Tag').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    color: t.exposeString('color'),
  }),
});

interface CashAccountShape {
  id: string;
  currency: string;
  balance: unknown;
  isDomestic: boolean;
  updatedAt: Date;
}

const CashAccountType = builder.objectRef<CashAccountShape>('CashAccount').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    currency: t.exposeString('currency'),
    balance: t.field({ type: 'Float', resolve: (c) => Number(c.balance) }),
    isDomestic: t.exposeBoolean('isDomestic'),
    updatedAt: t.field({ type: 'String', resolve: (c) => c.updatedAt.toISOString() }),
  }),
});

interface PortfolioShape {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  strategy: string;
  baseCurrency: string;
  isMargin: boolean;
  type: string;
  initialPaperBalance: unknown;
  paperSlippageBps: number | null;
  paperCommissionRate: unknown;
  createdAt: Date;
  cashAccounts: CashAccountShape[];
  tags: TagShape[];
}

const PortfolioType = builder.objectRef<PortfolioShape>('Portfolio').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    description: t.exposeString('description', { nullable: true }),
    imageUrl: t.exposeString('imageUrl', { nullable: true }),
    strategy: t.field({ type: StrategyTypeEnum, resolve: (p) => p.strategy as StrategyTypeValue }),
    baseCurrency: t.exposeString('baseCurrency'),
    isMargin: t.exposeBoolean('isMargin'),
    type: t.field({ type: PortfolioTypeEnum, resolve: (p) => p.type as PortfolioTypeValue }),
    initialPaperBalance: t.field({
      type: 'Float',
      nullable: true,
      resolve: (p) => (p.initialPaperBalance == null ? null : Number(p.initialPaperBalance)),
    }),
    paperSlippageBps: t.exposeInt('paperSlippageBps', { nullable: true }),
    paperCommissionRate: t.field({
      type: 'Float',
      nullable: true,
      resolve: (p) => (p.paperCommissionRate == null ? null : Number(p.paperCommissionRate)),
    }),
    createdAt: t.field({ type: 'String', resolve: (p) => p.createdAt.toISOString() }),
    cashAccounts: t.field({ type: [CashAccountType], resolve: (p) => p.cashAccounts }),
    tags: t.field({ type: [TagType], resolve: (p) => p.tags }),
  }),
});

builder.queryField('portfolio', (t) =>
  t.field({
    type: PortfolioType,
    nullable: true,
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return portfolioService.getPortfolioById(userId, String(args.id));
    },
  }),
);

builder.queryField('myPortfolios', (t) =>
  t.field({
    type: [PortfolioType],
    args: { type: t.arg({ type: PortfolioTypeEnum }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return portfolioService.listMyPortfolios(userId, (args.type as PortfolioTypeValue) ?? undefined);
    },
  }),
);

builder.queryField('cashAccounts', (t) =>
  t.field({
    type: [CashAccountType],
    args: { portfolioId: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return portfolioService.listCashAccounts(userId, String(args.portfolioId));
    },
  }),
);

builder.queryField('tags', (t) =>
  t.field({
    type: [TagType],
    resolve: (_root, _args, context: GraphQLContext) => {
      requireAuth(context);
      return portfolioService.listTags();
    },
  }),
);

builder.mutationField('createPortfolio', (t) =>
  t.field({
    type: PortfolioType,
    args: {
      name: t.arg.string({ required: true }),
      strategy: t.arg({ type: StrategyTypeEnum, required: true }),
      baseCurrency: t.arg.string({ required: true }),
      type: t.arg({ type: PortfolioTypeEnum, required: true }),
      isMargin: t.arg.boolean(),
      initialPaperBalance: t.arg.float(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return portfolioService.createPortfolio(userId, {
        name: args.name,
        strategy: args.strategy as StrategyTypeValue,
        baseCurrency: args.baseCurrency,
        type: args.type as PortfolioTypeValue,
        isMargin: args.isMargin ?? undefined,
        initialPaperBalance: args.initialPaperBalance ?? undefined,
      });
    },
  }),
);

builder.mutationField('updatePortfolio', (t) =>
  t.field({
    type: PortfolioType,
    args: {
      id: t.arg.id({ required: true }),
      name: t.arg.string(),
      description: t.arg.string(),
      imageUrl: t.arg.string(),
      strategy: t.arg({ type: StrategyTypeEnum }),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return portfolioService.updatePortfolio(userId, String(args.id), {
        name: args.name ?? undefined,
        description: args.description ?? undefined,
        imageUrl: args.imageUrl ?? undefined,
        strategy: (args.strategy as StrategyTypeValue) ?? undefined,
      });
    },
  }),
);

builder.mutationField('deletePortfolio', (t) =>
  t.field({
    type: 'Boolean',
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return portfolioService.deletePortfolio(userId, String(args.id));
    },
  }),
);

builder.mutationField('addCashAccount', (t) =>
  t.field({
    type: CashAccountType,
    args: {
      portfolioId: t.arg.id({ required: true }),
      currency: t.arg.string({ required: true }),
      isDomestic: t.arg.boolean(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return portfolioService.addCashAccount(
        userId,
        String(args.portfolioId),
        args.currency,
        args.isDomestic ?? undefined,
      );
    },
  }),
);

builder.mutationField('createTag', (t) =>
  t.field({
    type: TagType,
    args: { name: t.arg.string({ required: true }), color: t.arg.string() },
    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);
      return portfolioService.createTag(args.name, args.color ?? undefined);
    },
  }),
);

builder.mutationField('tagPortfolio', (t) =>
  t.field({
    type: PortfolioType,
    args: { portfolioId: t.arg.id({ required: true }), tagId: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return portfolioService.tagPortfolio(userId, String(args.portfolioId), String(args.tagId));
    },
  }),
);
