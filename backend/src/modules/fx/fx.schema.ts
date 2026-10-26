import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as fxService from './fx.service';

interface ExchangeRateShape {
  fromCurrency: string;
  toCurrency: string;
  rate: unknown;
  date: Date;
}

const ExchangeRateType = builder.objectRef<ExchangeRateShape>('ExchangeRate').implement({
  fields: (t) => ({
    fromCurrency: t.exposeString('fromCurrency'),
    toCurrency: t.exposeString('toCurrency'),
    rate: t.field({ type: 'Float', resolve: (r) => Number(r.rate) }),
    date: t.field({ type: 'String', resolve: (r) => r.date.toISOString() }),
  }),
});

builder.queryField('exchangeRate', (t) =>
  t.field({
    type: 'Float',
    args: {
      from: t.arg.string({ required: true }),
      to: t.arg.string({ required: true }),
      date: t.arg.string(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);
      return fxService.getExchangeRate(args.from, args.to, args.date ? new Date(args.date) : undefined);
    },
  }),
);

builder.queryField('exchangeRateHistory', (t) =>
  t.field({
    type: [ExchangeRateType],
    args: {
      from: t.arg.string({ required: true }),
      to: t.arg.string({ required: true }),
      startDate: t.arg.string({ required: true }),
      endDate: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);
      return fxService.listExchangeRates(args.from, args.to, new Date(args.startDate), new Date(args.endDate));
    },
  }),
);
