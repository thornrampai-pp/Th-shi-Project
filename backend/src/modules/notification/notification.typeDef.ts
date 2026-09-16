import { gql } from 'graphql-tag';

export const notificationTypeDefs = gql`
  enum NotificationChannelType {
    DISCORD
  }

  enum NotificationEventType {
    TRANSACTION_EXECUTED
    ALERT_TRIGGERED
    DAILY_SUMMARY
    BACKTEST_COMPLETED
    ORDER_FILLED
  }

  type NotificationChannel {
    id: ID!
    type: NotificationChannelType!
    label: String
    isActive: Boolean!
    events: [NotificationEventType!]!
    webhookUrlPreview: String!
    createdAt: String!
  }

  extend type Query {
    notificationChannels: [NotificationChannel!]!
  }

  extend type Mutation {
    connectDiscordChannel(
      webhookUrl: String!
      label: String
      events: [NotificationEventType!]!
    ): NotificationChannel!

    updateNotificationChannel(
      id: ID!
      label: String
      isActive: Boolean
      events: [NotificationEventType!]
    ): NotificationChannel!

    removeNotificationChannel(id: ID!): Boolean!
    testNotificationChannel(id: ID!): Boolean!
  }
`;
