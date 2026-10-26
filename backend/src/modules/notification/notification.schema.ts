import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as notificationService from './notification.service';
import type { NotificationEventType } from './notification.service';

export const NotificationChannelTypeEnum = builder.enumType('NotificationChannelType', {
  values: ['DISCORD'] as const,
});

export const NotificationEventTypeEnum = builder.enumType('NotificationEventType', {
  values: [
    'TRANSACTION_EXECUTED',
    'ALERT_TRIGGERED',
    'DAILY_SUMMARY',
    'BACKTEST_COMPLETED',
    'ORDER_FILLED',
    'SYSTEM_ALERT',
  ] as const,
});

interface NotificationChannelShape {
  id: string;
  type: string;
  label: string | null;
  isActive: boolean;
  events: string[];
  webhookUrl: string;
  createdAt: Date;
}

const NotificationChannelType = builder.objectRef<NotificationChannelShape>('NotificationChannel').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    type: t.field({ type: NotificationChannelTypeEnum, resolve: (c) => c.type as 'DISCORD' }),
    label: t.exposeString('label', { nullable: true }),
    isActive: t.exposeBoolean('isActive'),
    events: t.field({
      type: [NotificationEventTypeEnum],
      resolve: (c) => c.events as NotificationEventType[],
    }),
    // Never expose the full webhook URL — just enough to recognize which one it is.
    webhookUrlPreview: t.field({ type: 'String', resolve: (c) => `...${c.webhookUrl.slice(-8)}` }),
    createdAt: t.field({ type: 'String', resolve: (c) => c.createdAt.toISOString() }),
  }),
});

builder.queryField('notificationChannels', (t) =>
  t.field({
    type: [NotificationChannelType],
    resolve: (_root, _args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return notificationService.listNotificationChannels(userId);
    },
  }),
);

builder.mutationField('connectDiscordChannel', (t) =>
  t.field({
    type: NotificationChannelType,
    args: {
      webhookUrl: t.arg.string({ required: true }),
      label: t.arg.string(),
      events: t.arg({ type: [NotificationEventTypeEnum], required: true }),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return notificationService.connectDiscordChannel(
        userId,
        args.webhookUrl,
        args.events as NotificationEventType[],
        args.label ?? undefined,
      );
    },
  }),
);

builder.mutationField('updateNotificationChannel', (t) =>
  t.field({
    type: NotificationChannelType,
    args: {
      id: t.arg.id({ required: true }),
      label: t.arg.string(),
      isActive: t.arg.boolean(),
      events: t.arg({ type: [NotificationEventTypeEnum] }),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return notificationService.updateNotificationChannel(userId, String(args.id), {
        label: args.label ?? undefined,
        isActive: args.isActive ?? undefined,
        events: (args.events as NotificationEventType[] | null) ?? undefined,
      });
    },
  }),
);

builder.mutationField('removeNotificationChannel', (t) =>
  t.field({
    type: 'Boolean',
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return notificationService.removeNotificationChannel(userId, String(args.id));
    },
  }),
);

builder.mutationField('testNotificationChannel', (t) =>
  t.field({
    type: 'Boolean',
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return notificationService.testNotificationChannel(userId, String(args.id));
    },
  }),
);
