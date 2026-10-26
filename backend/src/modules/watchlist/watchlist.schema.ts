import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import { AssetType } from '../asset/asset.schema';
import * as watchListService from './watchlist.service';

type WatchListShape = Awaited<ReturnType<typeof watchListService.getWatchList>>;
type WatchListItemShape = WatchListShape['items'][number];

const WatchListItemType = builder.objectRef<WatchListItemShape>('WatchListItem').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    assetId: t.exposeString('assetId'),
    note: t.exposeString('note', { nullable: true }),
    createdAt: t.field({ type: 'String', resolve: (i) => i.createdAt.toISOString() }),
    asset: t.field({ type: AssetType, resolve: (i) => i.asset }),
  }),
});

const WatchListType = builder.objectRef<WatchListShape>('WatchList').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    createdAt: t.field({ type: 'String', resolve: (w) => w.createdAt.toISOString() }),
    items: t.field({ type: [WatchListItemType], resolve: (w) => w.items }),
  }),
});

builder.queryField('watchLists', (t) =>
  t.field({
    type: [WatchListType],
    resolve: (_root, _args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return watchListService.listWatchLists(userId);
    },
  }),
);

builder.queryField('watchList', (t) =>
  t.field({
    type: WatchListType,
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return watchListService.getWatchList(userId, String(args.id));
    },
  }),
);

builder.mutationField('createWatchList', (t) =>
  t.field({
    type: WatchListType,
    args: { name: t.arg.string({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return watchListService.createWatchList(userId, args.name);
    },
  }),
);

builder.mutationField('renameWatchList', (t) =>
  t.field({
    type: WatchListType,
    args: { id: t.arg.id({ required: true }), name: t.arg.string({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return watchListService.renameWatchList(userId, String(args.id), args.name);
    },
  }),
);

builder.mutationField('deleteWatchList', (t) =>
  t.field({
    type: 'Boolean',
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return watchListService.deleteWatchList(userId, String(args.id));
    },
  }),
);

builder.mutationField('addWatchListItem', (t) =>
  t.field({
    type: WatchListType,
    args: {
      watchListId: t.arg.id({ required: true }),
      assetId: t.arg.id({ required: true }),
      note: t.arg.string(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return watchListService.addWatchListItem(
        userId,
        String(args.watchListId),
        String(args.assetId),
        args.note ?? undefined,
      );
    },
  }),
);

builder.mutationField('removeWatchListItem', (t) =>
  t.field({
    type: WatchListType,
    args: { watchListId: t.arg.id({ required: true }), assetId: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return watchListService.removeWatchListItem(userId, String(args.watchListId), String(args.assetId));
    },
  }),
);
