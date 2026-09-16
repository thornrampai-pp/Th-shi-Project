import { prisma } from '../../config/prisma';
import { AppError } from '../../common/errors/AppError';
import { sendDiscordWebhookMessage, DiscordMessage } from '../../common/integrations/discord.util';

export type NotificationEventType =
  | 'TRANSACTION_EXECUTED'
  | 'ALERT_TRIGGERED'
  | 'DAILY_SUMMARY'
  | 'BACKTEST_COMPLETED'
  | 'ORDER_FILLED';

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

  const channel = await prisma.notificationChannel.create({
    data: { userId, type: 'DISCORD', webhookUrl, events, label },
  });

  await dispatchToChannel(
    channel,
    { text: `✅ เชื่อมต่อสำเร็จ! ช่องทางนี้ (${label ?? 'Discord'}) พร้อมรับข้อมูลการลงทุนแล้ว` },
    'DAILY_SUMMARY',
  );

  return channel;
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
  await dispatchToChannel(channel, { text: '🔔 นี่คือข้อความทดสอบจากระบบ Investment Platform' }, 'DAILY_SUMMARY');
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

async function dispatchToChannel(
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
