import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as ledgerService from './ledger.service';
import type { AccountTypeValue } from './ledger.service';

function serializeLedgerEntry(row: { amount: unknown; createdAt: Date; [key: string]: unknown }) {
  return { ...row, amount: Number(row.amount), createdAt: row.createdAt.toISOString() };
}

export const ledgerResolvers = {
  Query: {
    ledgerEntries: async (
      _: unknown,
      args: { portfolioId: string; from?: string; to?: string; accountType?: AccountTypeValue },
      context: GraphQLContext,
    ) => {
      const userId = requireAuth(context);
      const rows = await ledgerService.getLedgerEntries(userId, args.portfolioId, {
        from: args.from ? new Date(args.from) : undefined,
        to: args.to ? new Date(args.to) : undefined,
        accountType: args.accountType,
      });
      return rows.map(serializeLedgerEntry);
    },
  },
};
