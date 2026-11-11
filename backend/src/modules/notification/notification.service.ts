import { prisma } from '../../config/prisma';
import { AppError } from '../../common/errors/AppError';
import { sendDiscordWebhookMessage, DiscordMessage } from '../../common/integrations/discord.util';
import { connectedMessage, testMessage } from './notification-messages';

export type NotificationEventType =
  | 'TRANSACTION_EXECUTED'
  | 'ALERT_TRIGGERED'
  | 'DAILY_SUMMARY'
  | 'BACKTEST_COMPLETED'
  | 'ORDER_FILLED'
  | 'SYSTEM_ALERT';

export async function listNotificationChannels(userId: string) {
  return prisma.notificationChannel.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

export async function connectDiscordChannel(
  userId: string,
  webhookUrl: string,
  events: NotificationEventType[],
  label?: string,
) {
  if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    throw AppError.badRequest('This does not look like a valid Discord webhook URL');
  }

  // Verify the webhook actually works BEFORE persisting anything. Previously this sent
  // the test message through dispatchToChannel(), which swallows delivery failures into
  // a NotificationLog row and never rethrows — so connectDiscordChannel would report
  // success even for a typo'd or already-deleted webhook URL, and the user would only
  // find out the connection never worked when a real alert silently failed days later.
  // Calling sendDiscordWebhookMessage directly here lets that failure propagate.
  try {
    await sendDiscordWebhookMessage(webhookUrl, connectedMessage(label, events));
  } catch (err) {
    throw AppError.badRequest(
      `Could not send a test message to this Discord webhook: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }

  return prisma.notificationChannel.create({
    data: { userId, type: 'DISCORD', webhookUrl, events, label },
  });
}

export async function updateNotificationChannel(
  userId: string,
  id: string,
  data: { label?: string; isActive?: boolean; events?: NotificationEventType[] },
) {
  const channel = await getOwnedChannelOrThrow(userId, id);
  return prisma.notificationChannel.update({ where: { id: channel.id }, data });
}

export async function removeNotificationChannel(userId: string, id: string): Promise<boolean> {
  const channel = await getOwnedChannelOrThrow(userId, id);
  await prisma.notificationChannel.delete({ where: { id: channel.id } });
  return true;
}

export async function testNotificationChannel(userId: string, id: string): Promise<boolean> {
  const channel = await getOwnedChannelOrThrow(userId, id);
  await dispatchToChannel(channel, testMessage(channel.label), 'DAILY_SUMMARY');
  return true;
}

export async function notifyEvent(
  userId: string,
  eventType: NotificationEventType,
  message: DiscordMessage,
): Promise<void> {
  const channels = await prisma.notificationChannel.findMany({
    where: { userId, isActive: true, events: { has: eventType } },
  });

  await Promise.all(channels.map((channel) => dispatchToChannel(channel, message, eventType)));
}

async function getOwnedChannelOrThrow(userId: string, id: string) {
  const channel = await prisma.notificationChannel.findUnique({ where: { id } });
  if (!channel || channel.userId !== userId) {
    throw AppError.notFound('Notification channel not found');
  }
  return channel;
}

/**
 * Messages to one channel go out one at a time, in order. Several fired together (a
 * slip batch, a statement split over messages) used to race and trip Discord's
 * per-webhook rate limit; the queue plus the 429 retry in sendDiscordWebhookMessage
 * delivers them all.
 */
const channelQueues = new Map<string, Promise<void>>();

function dispatchToChannel(
  channel: { id: string; type: string; webhookUrl: string },
  message: DiscordMessage,
  eventType: NotificationEventType,
): Promise<void> {
  const previous = channelQueues.get(channel.id) ?? Promise.resolve();
  // A failure of one message must not stall the ones queued behind it.
  const next = previous.catch(() => undefined).then(() => deliver(channel, message, eventType));
  channelQueues.set(channel.id, next);
  next
    .finally(() => {
      if (channelQueues.get(channel.id) === next) channelQueues.delete(channel.id);
    })
    .catch(() => undefined); // the caller gets the rejection through `next`
  return next;
}

async function deliver(
  channel: { id: string; type: string; webhookUrl: string },
  message: DiscordMessage,
  eventType: NotificationEventType,
): Promise<void> {
  const log = await prisma.notificationLog.create({
    data: { channelId: channel.id, eventType, payload: message as object, status: 'PENDING' },
  });

  try {
    if (channel.type === 'DISCORD') {
      await sendDiscordWebhookMessage(channel.webhookUrl, message);
    }

    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  } catch (err) {
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', errorMessage: err instanceof Error ? err.message : 'Unknown error' },
    });
  }
}
