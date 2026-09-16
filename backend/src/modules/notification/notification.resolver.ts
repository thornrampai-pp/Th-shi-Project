import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as notificationService from './notification.service';
import type { NotificationEventType } from './notification.service';

export const notificationResolvers = {
  NotificationChannel: {
    webhookUrlPreview: (parent: { webhookUrl: string }) => `...${parent.webhookUrl.slice(-8)}`,
  },
  Query: {
    notificationChannels: (_: unknown, __: unknown, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return notificationService.listNotificationChannels(userId);
    },
  },
  Mutation: {
    connectDiscordChannel: (
      _: unknown,
      args: { webhookUrl: string; label?: string; events: NotificationEventType[] },
      context: GraphQLContext,
    ) => {
      const userId = requireAuth(context);
      return notificationService.connectDiscordChannel(userId, args.webhookUrl, args.events, args.label);
    },
    updateNotificationChannel: (
      _: unknown,
      args: { id: string; label?: string; isActive?: boolean; events?: NotificationEventType[] },
      context: GraphQLContext,
    ) => {
      const userId = requireAuth(context);
      return notificationService.updateNotificationChannel(userId, args.id, args);
    },
    removeNotificationChannel: (_: unknown, args: { id: string }, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return notificationService.removeNotificationChannel(userId, args.id);
    },
    testNotificationChannel: (_: unknown, args: { id: string }, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return notificationService.testNotificationChannel(userId, args.id);
    },
  },
};
