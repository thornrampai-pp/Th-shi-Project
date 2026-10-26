import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import { AssetType } from '../asset/asset.schema';
import * as orderService from './order.service';
import * as signalService from './signal.service';
import type { OrderSideValue, OrderStatusValue, OrderTypeValue } from './order.service';
import type { SignalTypeValue } from './signal.service';

function numOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

export const SignalTypeEnum = builder.enumType('SignalType', { values: ['BUY', 'SELL', 'HOLD'] as const });
export const OrderSideEnum = builder.enumType('OrderSide', { values: ['BUY', 'SELL'] as const });
export const OrderTypeEnum = builder.enumType('OrderType', { values: ['MARKET', 'LIMIT'] as const });
export const OrderStatusEnum = builder.enumType('OrderStatus', {
  values: ['PENDING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED'] as const,
});

type TradingSignalShape = Awaited<ReturnType<typeof signalService.listTradingSignals>>[number];

const TradingSignalType = builder.objectRef<TradingSignalShape>('TradingSignal').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    portfolioId: t.exposeString('portfolioId'),
    assetId: t.exposeString('assetId'),
    signalType: t.field({ type: SignalTypeEnum, resolve: (s) => s.signalType }),
    strength: t.field({ type: 'Float', nullable: true, resolve: (s) => numOrNull(s.strength) }),
    price: t.field({ type: 'Float', resolve: (s) => Number(s.price) }),
    source: t.exposeString('source'),
    metadataJson: t.field({
      type: 'String',
      nullable: true,
      resolve: (s) => (s.metadata == null ? null : JSON.stringify(s.metadata)),
    }),
    isExecuted: t.exposeBoolean('isExecuted'),
    createdAt: t.field({ type: 'String', resolve: (s) => s.createdAt.toISOString() }),
    asset: t.field({ type: AssetType, resolve: (s) => s.asset }),
  }),
});

type OrderShape = Awaited<ReturnType<typeof orderService.getOrder>>;

const OrderType = builder.objectRef<OrderShape>('Order').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    portfolioId: t.exposeString('portfolioId'),
    assetId: t.exposeString('assetId'),
    signalId: t.exposeString('signalId', { nullable: true }),
    side: t.field({ type: OrderSideEnum, resolve: (o) => o.side }),
    orderType: t.field({ type: OrderTypeEnum, resolve: (o) => o.orderType }),
    quantity: t.field({ type: 'Float', resolve: (o) => Number(o.quantity) }),
    limitPrice: t.field({ type: 'Float', nullable: true, resolve: (o) => numOrNull(o.limitPrice) }),
    filledQty: t.field({ type: 'Float', resolve: (o) => Number(o.filledQty) }),
    avgFillPrice: t.field({ type: 'Float', nullable: true, resolve: (o) => numOrNull(o.avgFillPrice) }),
    status: t.field({ type: OrderStatusEnum, resolve: (o) => o.status }),
    submittedAt: t.field({ type: 'String', resolve: (o) => o.submittedAt.toISOString() }),
    filledAt: t.field({ type: 'String', nullable: true, resolve: (o) => o.filledAt?.toISOString() ?? null }),
    cancelledAt: t.field({ type: 'String', nullable: true, resolve: (o) => o.cancelledAt?.toISOString() ?? null }),
    transactionId: t.exposeString('transactionId', { nullable: true }),
    asset: t.field({ type: AssetType, resolve: (o) => o.asset }),
  }),
});

/* ----------------------------- Signals ----------------------------- */

builder.queryField('tradingSignals', (t) =>
  t.field({
    type: [TradingSignalType],
    args: { portfolioId: t.arg.id({ required: true }), isExecuted: t.arg.boolean(), limit: t.arg.int() },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return signalService.listTradingSignals(userId, String(args.portfolioId), {
        isExecuted: args.isExecuted ?? undefined,
        limit: args.limit ?? undefined,
      });
    },
  }),
);

builder.mutationField('createTradingSignal', (t) =>
  t.field({
    type: TradingSignalType,
    args: {
      portfolioId: t.arg.id({ required: true }),
      assetId: t.arg.id({ required: true }),
      signalType: t.arg({ type: SignalTypeEnum, required: true }),
      price: t.arg.float({ required: true }),
      strength: t.arg.float(),
      source: t.arg.string(),
      metadataJson: t.arg.string({ description: 'Indicator values etc. as a JSON string' }),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      let metadata: unknown;
      if (args.metadataJson) {
        try {
          metadata = JSON.parse(args.metadataJson);
        } catch {
          throw new Error('metadataJson is not valid JSON');
        }
      }
      return signalService.createTradingSignal(userId, {
        portfolioId: String(args.portfolioId),
        assetId: String(args.assetId),
        signalType: args.signalType as SignalTypeValue,
        price: args.price,
        strength: args.strength ?? undefined,
        source: args.source ?? undefined,
        metadata,
      });
    },
  }),
);

builder.mutationField('executeTradingSignal', (t) =>
  t.field({
    type: OrderType,
    args: {
      id: t.arg.id({ required: true }),
      quantity: t.arg.float({ required: true }),
      orderType: t.arg({ type: OrderTypeEnum }),
      limitPrice: t.arg.float(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return signalService.executeSignal(userId, String(args.id), {
        quantity: args.quantity,
        orderType: (args.orderType as OrderTypeValue) ?? undefined,
        limitPrice: args.limitPrice ?? undefined,
      });
    },
  }),
);

builder.mutationField('dismissTradingSignal', (t) =>
  t.field({
    type: TradingSignalType,
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return signalService.dismissSignal(userId, String(args.id));
    },
  }),
);

/* ------------------------------ Orders ------------------------------ */

builder.queryField('orders', (t) =>
  t.field({
    type: [OrderType],
    args: { portfolioId: t.arg.id({ required: true }), status: t.arg({ type: OrderStatusEnum }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return orderService.listOrders(userId, String(args.portfolioId), (args.status as OrderStatusValue) ?? undefined);
    },
  }),
);

builder.queryField('order', (t) =>
  t.field({
    type: OrderType,
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return orderService.getOrder(userId, String(args.id));
    },
  }),
);

builder.mutationField('placeOrder', (t) =>
  t.field({
    type: OrderType,
    args: {
      portfolioId: t.arg.id({ required: true }),
      assetId: t.arg.id({ required: true }),
      side: t.arg({ type: OrderSideEnum, required: true }),
      orderType: t.arg({ type: OrderTypeEnum, required: true }),
      quantity: t.arg.float({ required: true }),
      limitPrice: t.arg.float(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return orderService.placeOrder(userId, {
        portfolioId: String(args.portfolioId),
        assetId: String(args.assetId),
        side: args.side as OrderSideValue,
        orderType: args.orderType as OrderTypeValue,
        quantity: args.quantity,
        limitPrice: args.limitPrice ?? undefined,
      });
    },
  }),
);

builder.mutationField('fillOrder', (t) =>
  t.field({
    type: OrderType,
    description: 'Record the actual broker execution of a REAL-portfolio order',
    args: {
      id: t.arg.id({ required: true }),
      fillPrice: t.arg.float({ required: true }),
      fee: t.arg.float(),
      executedAt: t.arg.string(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return orderService.fillOrder(userId, String(args.id), {
        fillPrice: args.fillPrice,
        fee: args.fee ?? undefined,
        executedAt: args.executedAt ? new Date(args.executedAt) : undefined,
      });
    },
  }),
);

builder.mutationField('cancelOrder', (t) =>
  t.field({
    type: OrderType,
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return orderService.cancelOrder(userId, String(args.id));
    },
  }),
);
