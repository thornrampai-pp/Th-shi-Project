import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import { AssetType } from '../asset/asset.schema';
import * as alertService from './alert.service';
import { ALERT_CONDITIONS } from './alert.service';
import type { AlertConditionValue } from './alert.service';

export const AlertConditionEnum = builder.enumType('AlertCondition', { values: ALERT_CONDITIONS });

type AlertShape = Awaited<ReturnType<typeof alertService.listAlerts>>[number];

const AlertType = builder.objectRef<AlertShape>('Alert').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    assetId: t.exposeString('assetId'),
    condition: t.field({ type: AlertConditionEnum, resolve: (a) => a.condition as AlertConditionValue }),
    targetValue: t.field({ type: 'Float', resolve: (a) => Number(a.targetValue) }),
    isActive: t.exposeBoolean('isActive'),
    createdAt: t.field({ type: 'String', resolve: (a) => a.createdAt.toISOString() }),
    updatedAt: t.field({ type: 'String', resolve: (a) => a.updatedAt.toISOString() }),
    asset: t.field({ type: AssetType, resolve: (a) => a.asset }),
  }),
});

builder.queryField('alerts', (t) =>
  t.field({
    type: [AlertType],
    args: { assetId: t.arg.id(), isActive: t.arg.boolean() },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return alertService.listAlerts(userId, {
        assetId: args.assetId ? String(args.assetId) : undefined,
        isActive: args.isActive ?? undefined,
      });
    },
  }),
);

builder.mutationField('createAlert', (t) =>
  t.field({
    type: AlertType,
    args: {
      assetId: t.arg.id({ required: true }),
      condition: t.arg({ type: AlertConditionEnum, required: true }),
      targetValue: t.arg.float({ required: true }),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return alertService.createAlert(userId, {
        assetId: String(args.assetId),
        condition: args.condition,
        targetValue: args.targetValue,
      });
    },
  }),
);

builder.mutationField('updateAlert', (t) =>
  t.field({
    type: AlertType,
    args: {
      id: t.arg.id({ required: true }),
      condition: t.arg({ type: AlertConditionEnum }),
      targetValue: t.arg.float(),
      isActive: t.arg.boolean(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return alertService.updateAlert(userId, String(args.id), {
        condition: args.condition ?? undefined,
        targetValue: args.targetValue ?? undefined,
        isActive: args.isActive ?? undefined,
      });
    },
  }),
);

builder.mutationField('deleteAlert', (t) =>
  t.field({
    type: 'Boolean',
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return alertService.deleteAlert(userId, String(args.id));
    },
  }),
);
