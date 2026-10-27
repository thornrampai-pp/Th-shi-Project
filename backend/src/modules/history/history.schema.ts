import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as historyService from './history.service';

builder.queryField('dataSyncedAt', (t) =>
  t.string({
    nullable: true,
    description: 'When prices, FX and snapshots were last synced (ISO 8601), or null if never',
    resolve: (_root, _args, context: GraphQLContext) => {
      requireAuth(context);
      return historyService.getLastSyncedAt();
    },
  }),
);

builder.mutationField('rebuildPortfolioSnapshots', (t) =>
  t.field({
    type: 'Boolean',
    description: 'Re-fetch missing price/FX history and recompute every daily snapshot (runs in the background)',
    args: { portfolioId: t.arg.id({ required: true }), from: t.arg.string() },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return historyService.requestSnapshotRebuild(
        userId,
        String(args.portfolioId),
        args.from ? new Date(args.from) : undefined,
      );
    },
  }),
);
