import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import { AssetType } from '../asset/asset.schema';
import * as thesisService from './thesis.service';
import type { ThesisInput, ThesisStatusValue } from './thesis.service';

function numOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

export const ThesisStatusEnum = builder.enumType('ThesisStatus', {
  values: ['DRAFT', 'WATCHING', 'ACTIVE', 'ARCHIVED'] as const,
});

type ThesisShape = Awaited<ReturnType<typeof thesisService.getThesis>>;

const InvestmentThesisType = builder.objectRef<ThesisShape>('InvestmentThesis').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    assetId: t.exposeString('assetId'),
    portfolioId: t.exposeString('portfolioId', { nullable: true }),
    status: t.field({ type: ThesisStatusEnum, resolve: (th) => th.status }),
    title: t.exposeString('title'),
    summary: t.exposeString('summary', { nullable: true }),
    entryPrice: t.field({ type: 'Float', nullable: true, resolve: (th) => numOrNull(th.entryPrice) }),
    targetPrice: t.field({ type: 'Float', nullable: true, resolve: (th) => numOrNull(th.targetPrice) }),
    stopLoss: t.field({ type: 'Float', nullable: true, resolve: (th) => numOrNull(th.stopLoss) }),
    // Upside to target vs. downside to stop, both measured from the planned entry.
    rewardRiskRatio: t.field({
      type: 'Float',
      nullable: true,
      resolve: (th) => {
        const entry = numOrNull(th.entryPrice);
        const target = numOrNull(th.targetPrice);
        const stop = numOrNull(th.stopLoss);
        if (entry == null || target == null || stop == null || entry <= stop) return null;
        return (target - entry) / (entry - stop);
      },
    }),
    timeHorizon: t.exposeString('timeHorizon', { nullable: true }),
    catalysts: t.exposeString('catalysts', { nullable: true }),
    risks: t.exposeString('risks', { nullable: true }),
    notes: t.exposeString('notes', { nullable: true }),
    createdAt: t.field({ type: 'String', resolve: (th) => th.createdAt.toISOString() }),
    updatedAt: t.field({ type: 'String', resolve: (th) => th.updatedAt.toISOString() }),
    asset: t.field({ type: AssetType, resolve: (th) => th.asset }),
  }),
});

const ThesisInputType = builder.inputType('InvestmentThesisInput', {
  fields: (t) => ({
    assetId: t.id(),
    portfolioId: t.id(),
    status: t.field({ type: ThesisStatusEnum }),
    title: t.string(),
    summary: t.string(),
    entryPrice: t.float(),
    targetPrice: t.float(),
    stopLoss: t.float(),
    timeHorizon: t.string(),
    catalysts: t.string(),
    risks: t.string(),
    notes: t.string(),
  }),
});

// GraphQL nulls → undefined ("leave unchanged"), except portfolioId where an explicit
// null means "unlink from portfolio".
function toThesisInput(input: typeof ThesisInputType.$inferInput): ThesisInput {
  return {
    assetId: input.assetId != null ? String(input.assetId) : undefined,
    portfolioId: input.portfolioId === null ? null : input.portfolioId != null ? String(input.portfolioId) : undefined,
    status: (input.status as ThesisStatusValue) ?? undefined,
    title: input.title ?? undefined,
    summary: input.summary ?? undefined,
    entryPrice: input.entryPrice ?? undefined,
    targetPrice: input.targetPrice ?? undefined,
    stopLoss: input.stopLoss ?? undefined,
    timeHorizon: input.timeHorizon ?? undefined,
    catalysts: input.catalysts ?? undefined,
    risks: input.risks ?? undefined,
    notes: input.notes ?? undefined,
  };
}

builder.queryField('investmentTheses', (t) =>
  t.field({
    type: [InvestmentThesisType],
    args: {
      status: t.arg({ type: ThesisStatusEnum }),
      assetId: t.arg.id(),
      portfolioId: t.arg.id(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return thesisService.listTheses(userId, {
        status: (args.status as ThesisStatusValue) ?? undefined,
        assetId: args.assetId ? String(args.assetId) : undefined,
        portfolioId: args.portfolioId ? String(args.portfolioId) : undefined,
      });
    },
  }),
);

builder.queryField('investmentThesis', (t) =>
  t.field({
    type: InvestmentThesisType,
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return thesisService.getThesis(userId, String(args.id));
    },
  }),
);

builder.mutationField('createInvestmentThesis', (t) =>
  t.field({
    type: InvestmentThesisType,
    args: {
      assetId: t.arg.id({ required: true }),
      title: t.arg.string({ required: true }),
      input: t.arg({ type: ThesisInputType }),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return thesisService.createThesis(userId, {
        ...(args.input ? toThesisInput(args.input) : {}),
        assetId: String(args.assetId),
        title: args.title,
      });
    },
  }),
);

builder.mutationField('updateInvestmentThesis', (t) =>
  t.field({
    type: InvestmentThesisType,
    args: { id: t.arg.id({ required: true }), input: t.arg({ type: ThesisInputType, required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return thesisService.updateThesis(userId, String(args.id), toThesisInput(args.input));
    },
  }),
);

builder.mutationField('deleteInvestmentThesis', (t) =>
  t.field({
    type: 'Boolean',
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return thesisService.deleteThesis(userId, String(args.id));
    },
  }),
);
