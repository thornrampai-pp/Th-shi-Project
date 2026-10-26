import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as ledgerService from './ledger.service';
import type { AccountTypeValue } from './ledger.service';

export const AccountTypeEnum = builder.enumType('AccountType', { values: ['CASH', 'ASSET', 'EQUITY'] as const });
export const EntrySideEnum = builder.enumType('EntrySide', { values: ['DEBIT', 'CREDIT'] as const });

interface LedgerEntryShape {
  id: string;
  transactionId: string;
  accountType: string;
  side: string;
  amount: unknown;
  assetSymbol: string;
  createdAt: Date;
}

const LedgerEntryType = builder.objectRef<LedgerEntryShape>('LedgerEntry').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    transactionId: t.exposeString('transactionId'),
    accountType: t.field({ type: AccountTypeEnum, resolve: (e) => e.accountType as 'CASH' | 'ASSET' | 'EQUITY' }),
    side: t.field({ type: EntrySideEnum, resolve: (e) => e.side as 'DEBIT' | 'CREDIT' }),
    amount: t.field({ type: 'Float', resolve: (e) => Number(e.amount) }),
    assetSymbol: t.exposeString('assetSymbol'),
    createdAt: t.field({ type: 'String', resolve: (e) => e.createdAt.toISOString() }),
  }),
});

builder.queryField('ledgerEntries', (t) =>
  t.field({
    type: [LedgerEntryType],
    args: {
      portfolioId: t.arg.id({ required: true }),
      from: t.arg.string(),
      to: t.arg.string(),
      accountType: t.arg({ type: AccountTypeEnum }),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return ledgerService.getLedgerEntries(userId, String(args.portfolioId), {
        from: args.from ? new Date(args.from) : undefined,
        to: args.to ? new Date(args.to) : undefined,
        accountType: (args.accountType as AccountTypeValue) ?? undefined,
      });
    },
  }),
);
