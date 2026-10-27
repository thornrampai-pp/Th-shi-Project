import { builder } from '../../graphql/builder';
import { prisma } from '../../config/prisma';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as transactionService from './transaction.service';
import type { TransactionTypeValue } from './transaction.service';
import * as slipService from './slip.service';
import * as fxBreakdownService from './fx-breakdown.service';
import type { PositionFxBreakdown } from './fx-breakdown.service';

export const TransactionTypeEnum = builder.enumType('TransactionType', {
  values: ['BUY', 'SELL', 'DEPOSIT', 'WITHDRAW', 'DIVIDEND', 'REPATRIATION', 'FEE', 'TAX', 'SPLIT', 'ADJUSTMENT'] as const,
});

function numOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

interface TransactionShape {
  id: string;
  portfolioId: string;
  type: string;
  status: string;
  executedAt: Date;
  mainAssetId: string | null;
  mainQuantity: unknown;
  mainPrice: unknown;
  baseCurrAmount: unknown;
  fee: unknown;
  taxWithheld: unknown;
  exchangeRate: unknown;
  metadata: unknown;
  createdAt: Date;
  // Preloaded by listTransactions(); resolved per row elsewhere.
  assetSymbol?: string | null;
  slipVerification?: { id: string } | null;
}

function metadataOf(tr: TransactionShape): Record<string, unknown> {
  return tr.metadata && typeof tr.metadata === 'object' ? (tr.metadata as Record<string, unknown>) : {};
}

export const TransactionType = builder.objectRef<TransactionShape>('Transaction').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    portfolioId: t.exposeString('portfolioId'),
    type: t.field({ type: TransactionTypeEnum, resolve: (tr) => tr.type as TransactionTypeValue }),
    status: t.exposeString('status'),
    executedAt: t.field({ type: 'String', resolve: (tr) => tr.executedAt.toISOString() }),
    mainAssetId: t.exposeString('mainAssetId', { nullable: true }),
    assetSymbol: t.field({
      type: 'String',
      nullable: true,
      resolve: async (tr) => {
        if (tr.assetSymbol !== undefined) return tr.assetSymbol;
        if (!tr.mainAssetId) return null;
        const asset = await prisma.asset.findUnique({ where: { id: tr.mainAssetId }, select: { symbol: true } });
        return asset?.symbol ?? null;
      },
    }),
    hasSlip: t.boolean({
      resolve: async (tr) => {
        if (tr.slipVerification !== undefined) return tr.slipVerification != null;
        return (await prisma.slipVerification.count({ where: { transactionId: tr.id } })) > 0;
      },
    }),
    mainQuantity: t.field({ type: 'Float', nullable: true, resolve: (tr) => numOrNull(tr.mainQuantity) }),
    mainPrice: t.field({ type: 'Float', nullable: true, resolve: (tr) => numOrNull(tr.mainPrice) }),
    baseCurrAmount: t.field({ type: 'Float', nullable: true, resolve: (tr) => numOrNull(tr.baseCurrAmount) }),
    fee: t.field({ type: 'Float', nullable: true, resolve: (tr) => numOrNull(tr.fee) }),
    taxWithheld: t.field({ type: 'Float', nullable: true, resolve: (tr) => numOrNull(tr.taxWithheld) }),
    exchangeRate: t.field({ type: 'Float', nullable: true, resolve: (tr) => numOrNull(tr.exchangeRate) }),
    currency: t.field({
      type: 'String',
      nullable: true,
      resolve: (tr) => {
        const currency = metadataOf(tr).currency;
        return typeof currency === 'string' ? currency : null;
      },
    }),
    realizedPL: t.field({
      type: 'Float',
      nullable: true,
      resolve: (tr) => numOrNull(metadataOf(tr).realizedPL),
    }),
    // SELL only, in THB: realizedPLHome = realizedStockPLHome + realizedFxPLHome.
    // Null for sells recorded before the FX split existed (or paper trades without a rate).
    realizedPLHome: t.field({ type: 'Float', nullable: true, resolve: (tr) => numOrNull(metadataOf(tr).realizedPLHome) }),
    realizedStockPLHome: t.field({
      type: 'Float',
      nullable: true,
      resolve: (tr) => numOrNull(metadataOf(tr).realizedStockPLHome),
    }),
    realizedFxPLHome: t.field({ type: 'Float', nullable: true, resolve: (tr) => numOrNull(metadataOf(tr).realizedFxPLHome) }),
    costBasisHome: t.field({ type: 'Float', nullable: true, resolve: (tr) => numOrNull(metadataOf(tr).costBasisHome) }),
    note: t.field({
      type: 'String',
      nullable: true,
      resolve: (tr) => {
        const note = metadataOf(tr).note;
        return typeof note === 'string' ? note : null;
      },
    }),
    metadataJson: t.field({
      type: 'String',
      nullable: true,
      resolve: (tr) => (tr.metadata == null ? null : JSON.stringify(tr.metadata)),
    }),
    createdAt: t.field({ type: 'String', resolve: (tr) => tr.createdAt.toISOString() }),
  }),
});

interface PositionShape {
  id: string;
  portfolioId: string;
  assetId: string;
  quantity: unknown;
  avgPrice: unknown;
  realizedPL: unknown;
  totalDiv: unknown;
  realizedPLHome: unknown;
  realizedStockPLHome: unknown;
  realizedFxPLHome: unknown;
  updatedAt: Date;
}

export const PositionType = builder.objectRef<PositionShape>('Position').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    portfolioId: t.exposeString('portfolioId'),
    assetId: t.exposeString('assetId'),
    quantity: t.field({ type: 'Float', resolve: (p) => Number(p.quantity) }),
    avgPrice: t.field({ type: 'Float', resolve: (p) => Number(p.avgPrice) }),
    realizedPL: t.field({ type: 'Float', resolve: (p) => Number(p.realizedPL) }),
    totalDiv: t.field({ type: 'Float', resolve: (p) => Number(p.totalDiv) }),
    realizedPLHome: t.field({ type: 'Float', resolve: (p) => Number(p.realizedPLHome) }),
    realizedStockPLHome: t.field({ type: 'Float', resolve: (p) => Number(p.realizedStockPLHome) }),
    realizedFxPLHome: t.field({ type: 'Float', resolve: (p) => Number(p.realizedFxPLHome) }),
    updatedAt: t.field({ type: 'String', resolve: (p) => p.updatedAt.toISOString() }),
  }),
});

interface SlipVerificationShape {
  id: string;
  transRef: string;
  sendingBank: string | null;
  receivingBank: string | null;
  senderName: string | null;
  amount: unknown;
  currency: string;
  fee: unknown;
  isAmountMatched: boolean;
  verifiedAt: Date;
  imageKey: string | null;
  imageUrl: string | null;
  imageMimeType: string | null;
  imageSize: number | null;
}

const SlipVerificationType = builder.objectRef<SlipVerificationShape>('SlipVerification').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    transRef: t.exposeString('transRef'),
    sendingBank: t.exposeString('sendingBank', { nullable: true }),
    receivingBank: t.exposeString('receivingBank', { nullable: true }),
    senderName: t.exposeString('senderName', { nullable: true }),
    amount: t.field({ type: 'Float', resolve: (s) => Number(s.amount) }),
    currency: t.exposeString('currency'),
    fee: t.field({ type: 'Float', nullable: true, resolve: (s) => numOrNull(s.fee) }),
    isAmountMatched: t.exposeBoolean('isAmountMatched'),
    verifiedAt: t.field({ type: 'String', resolve: (s) => s.verifiedAt.toISOString() }),
    imageMimeType: t.exposeString('imageMimeType', { nullable: true }),
    imageSize: t.exposeInt('imageSize', { nullable: true }),
    // Presigned R2 URL, valid for R2_PRESIGN_TTL_SECONDS — fetch fresh, don't store it.
    imageUrl: t.field({ type: 'String', nullable: true, resolve: (s) => slipService.getSlipImageUrl(s) }),
  }),
});

builder.queryField('transactionSlip', (t) =>
  t.field({
    type: SlipVerificationType,
    nullable: true,
    args: { transactionId: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return slipService.getTransactionSlip(userId, String(args.transactionId));
    },
  }),
);

builder.queryField('transaction', (t) =>
  t.field({
    type: TransactionType,
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return transactionService.getTransactionById(userId, String(args.id));
    },
  }),
);

builder.queryField('transactions', (t) =>
  t.field({
    type: [TransactionType],
    args: {
      portfolioId: t.arg.id({ required: true }),
      type: t.arg({ type: TransactionTypeEnum }),
      from: t.arg.string(),
      to: t.arg.string(),
      limit: t.arg.int(),
      offset: t.arg.int(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return transactionService.listTransactions(userId, String(args.portfolioId), {
        type: (args.type as TransactionTypeValue) ?? undefined,
        from: args.from ? new Date(args.from) : undefined,
        to: args.to ? new Date(args.to) : undefined,
        limit: args.limit ?? undefined,
        offset: args.offset ?? undefined,
      });
    },
  }),
);

builder.queryField('positions', (t) =>
  t.field({
    type: [PositionType],
    args: { portfolioId: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return transactionService.listPositions(userId, String(args.portfolioId));
    },
  }),
);

builder.queryField('position', (t) =>
  t.field({
    type: PositionType,
    args: { portfolioId: t.arg.id({ required: true }), assetId: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return transactionService.getPosition(userId, String(args.portfolioId), String(args.assetId));
    },
  }),
);

builder.mutationField('createTransaction', (t) =>
  t.field({
    type: TransactionType,
    args: {
      portfolioId: t.arg.id({ required: true }),
      type: t.arg({ type: TransactionTypeEnum, required: true }),
      assetId: t.arg.id(),
      quantity: t.arg.float(),
      price: t.arg.float(),
      amount: t.arg.float(),
      currency: t.arg.string(),
      fee: t.arg.float(),
      taxWithheld: t.arg.float(),
      ratio: t.arg.float(),
      sourceCountry: t.arg.string({ description: 'ISO 2-letter country for the tax record; default from the asset exchange' }),
      note: t.arg.string(),
      executedAt: t.arg.string(),
      fundWithDeposit: t.arg.boolean({
        description: 'BUY only: deposit the full cost first in the same DB transaction (for holdings bought elsewhere)',
      }),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return transactionService.createTransaction(userId, {
        fundWithDeposit: args.fundWithDeposit ?? undefined,
        portfolioId: String(args.portfolioId),
        type: args.type as TransactionTypeValue,
        assetId: args.assetId ? String(args.assetId) : undefined,
        quantity: args.quantity ?? undefined,
        price: args.price ?? undefined,
        amount: args.amount ?? undefined,
        currency: args.currency ?? undefined,
        fee: args.fee ?? undefined,
        taxWithheld: args.taxWithheld ?? undefined,
        ratio: args.ratio ?? undefined,
        sourceCountry: args.sourceCountry ?? undefined,
        note: args.note ?? undefined,
        executedAt: args.executedAt ? new Date(args.executedAt) : undefined,
      });
    },
  }),
);

builder.mutationField('uploadTransactionSlip', (t) =>
  t.field({
    type: SlipVerificationType,
    args: {
      transactionId: t.arg.id({ required: true }),
      imageBase64: t.arg.string({ required: true }),
      mimeType: t.arg.string(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return slipService.uploadTransactionSlip(
        userId,
        String(args.transactionId),
        args.imageBase64,
        args.mimeType ?? undefined,
      );
    },
  }),
);

const SLIP_MATCH_STATUSES = [
  'MATCHED',
  'NOT_FOUND',
  'AMBIGUOUS',
  'DUPLICATE',
  'UNREADABLE',
  'INVALID',
  'EXTRACTION_FAILED',
  'ERROR',
] as const;

const SlipMatchStatusEnum = builder.enumType('SlipMatchStatus', { values: SLIP_MATCH_STATUSES });

interface SlipMatchResultShape {
  status: (typeof SLIP_MATCH_STATUSES)[number];
  message: string | null;
  transactionId: string | null;
  isAmountMatched: boolean;
  amount: number | null;
  currency: string | null;
  transRef: string | null;
  assetSymbol: string | null;
  candidateIds: string[];
}

const SlipMatchResultType = builder.objectRef<SlipMatchResultShape>('SlipMatchResult').implement({
  fields: (t) => ({
    status: t.field({ type: SlipMatchStatusEnum, resolve: (r) => r.status }),
    message: t.exposeString('message', { nullable: true }),
    transactionId: t.exposeString('transactionId', { nullable: true }),
    isAmountMatched: t.exposeBoolean('isAmountMatched'),
    amount: t.exposeFloat('amount', { nullable: true }),
    currency: t.exposeString('currency', { nullable: true }),
    transRef: t.exposeString('transRef', { nullable: true }),
    assetSymbol: t.exposeString('assetSymbol', { nullable: true }),
    candidateIds: t.exposeStringList('candidateIds'),
  }),
});

const SlipImageInput = builder.inputType('SlipImageInput', {
  fields: (t) => ({
    imageBase64: t.string({ required: true }),
    mimeType: t.string(),
  }),
});

function toSlipMatchResult(result: slipService.SlipBatchItemResult): SlipMatchResultShape {
  const extracted = 'extracted' in result ? result.extracted : null;
  return {
    status: result.status.toUpperCase() as SlipMatchResultShape['status'],
    message: 'message' in result ? result.message : null,
    transactionId: result.status === 'matched' ? result.slip.transactionId : null,
    isAmountMatched: result.status === 'matched' && result.slip.isAmountMatched,
    amount: extracted?.amount ?? null,
    currency: extracted?.currency ?? null,
    transRef: extracted?.transRef ?? null,
    assetSymbol: extracted?.assetSymbol ?? null,
    candidateIds: result.status === 'ambiguous' ? result.candidateIds : [],
  };
}

builder.mutationField('autoMatchSlips', (t) =>
  t.field({
    type: [SlipMatchResultType],
    description:
      'Reads up to 5 slips in one OCR request and attaches each to its one matching transaction; ' +
      'returns one result per image, in order. A slip with no single match saves nothing.',
    args: {
      images: t.arg({ type: [SlipImageInput], required: true }),
      portfolioId: t.arg.id({ description: 'Only match transactions in this portfolio' }),
    },
    resolve: async (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      const results = await slipService.autoMatchSlips(
        userId,
        args.images.map((i) => ({ imageBase64: i.imageBase64, mimeType: i.mimeType ?? undefined })),
        { portfolioId: args.portfolioId ? String(args.portfolioId) : undefined },
      );
      return results.map(toSlipMatchResult);
    },
  }),
);

/* ------------------------- FX vs stock P/L breakdown ------------------------- */

const PositionFxBreakdownType = builder.objectRef<PositionFxBreakdown>('PositionFxBreakdown').implement({
  fields: (t) => ({
    assetId: t.exposeString('assetId'),
    symbol: t.exposeString('symbol'),
    currency: t.exposeString('currency'),
    quantity: t.exposeFloat('quantity'),
    marketPrice: t.exposeFloat('marketPrice', { nullable: true }),
    currentFxRate: t.exposeFloat('currentFxRate', { nullable: true }),
    costBasis: t.exposeFloat('costBasis'),
    costBasisHome: t.exposeFloat('costBasisHome', { nullable: true }),
    marketValueHome: t.exposeFloat('marketValueHome', { nullable: true }),
    unrealizedPLHome: t.exposeFloat('unrealizedPLHome', { nullable: true }),
    unrealizedStockPLHome: t.exposeFloat('unrealizedStockPLHome', { nullable: true }),
    unrealizedFxPLHome: t.exposeFloat('unrealizedFxPLHome', { nullable: true }),
    realizedPLHome: t.exposeFloat('realizedPLHome'),
    realizedStockPLHome: t.exposeFloat('realizedStockPLHome'),
    realizedFxPLHome: t.exposeFloat('realizedFxPLHome'),
  }),
});

type PortfolioFxBreakdownShape = Awaited<ReturnType<typeof fxBreakdownService.getPortfolioFxBreakdown>>;

const FxBreakdownTotalsType = builder
  .objectRef<PortfolioFxBreakdownShape['totals']>('FxBreakdownTotals')
  .implement({
    fields: (t) => ({
      unrealizedPLHome: t.exposeFloat('unrealizedPLHome'),
      unrealizedStockPLHome: t.exposeFloat('unrealizedStockPLHome'),
      unrealizedFxPLHome: t.exposeFloat('unrealizedFxPLHome'),
      realizedPLHome: t.exposeFloat('realizedPLHome'),
      realizedStockPLHome: t.exposeFloat('realizedStockPLHome'),
      realizedFxPLHome: t.exposeFloat('realizedFxPLHome'),
      complete: t.exposeBoolean('complete'),
    }),
  });

const PortfolioFxBreakdownType = builder.objectRef<PortfolioFxBreakdownShape>('PortfolioFxBreakdown').implement({
  fields: (t) => ({
    homeCurrency: t.exposeString('homeCurrency'),
    positions: t.field({ type: [PositionFxBreakdownType], resolve: (b) => b.positions }),
    totals: t.field({ type: FxBreakdownTotalsType, resolve: (b) => b.totals }),
  }),
});

builder.queryField('portfolioFxBreakdown', (t) =>
  t.field({
    type: PortfolioFxBreakdownType,
    description: 'P/L in THB split into stock-price and FX components, realized and unrealized',
    args: { portfolioId: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return fxBreakdownService.getPortfolioFxBreakdown(userId, String(args.portfolioId));
    },
  }),
);
