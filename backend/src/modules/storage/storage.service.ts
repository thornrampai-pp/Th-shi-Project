import { prisma } from "../../config/prisma";
import { redis } from "../../config/redis";
import { env } from "../../config/env";
import { acquireOnceLock } from "../../common/utils/cache.util";
import { buildInvestmentEmbed } from "../../common/integrations/discord.util";
import { notifyEvent } from "../notification/notification.service";
import { computeUsage, formatBytes, highestReachedThreshold } from "./storage-usage";
import type { StorageUsage } from "./storage-usage";

// Same threshold re-alerts at most once a week while usage stays above it; reaching a
// HIGHER threshold alerts immediately (different key).
const REALERT_AFTER_SECONDS = 7 * 24 * 3600;
const alertKey = (threshold: number) => `storage-alert:r2:${threshold}`;

/**
 * Bytes used by slip images in R2, summed from SlipVerification.imageSize — no R2 API
 * call needed. Legacy base64 rows (imageKey = null) live in Postgres, not R2, so
 * they're excluded.
 */
export async function getSlipStorageUsage(): Promise<StorageUsage & { objectCount: number }> {
  const result = await prisma.slipVerification.aggregate({
    where: { imageKey: { not: null } },
    _sum: { imageSize: true },
    _count: { _all: true },
  });
  return {
    ...computeUsage(result._sum.imageSize ?? 0, env.R2_STORAGE_QUOTA_BYTES),
    objectCount: result._count._all,
  };
}

export interface StorageCheckResult {
  usage: StorageUsage & { objectCount: number };
  threshold: number | null;
  notified: boolean;
  reason?: string;
}

/**
 * Daily job: when usage reaches an alert threshold, sends SYSTEM_ALERT to every
 * active ADMIN user's Discord channels subscribed to it.
 */
export async function checkSlipStorageUsage(): Promise<StorageCheckResult> {
  const usage = await getSlipStorageUsage();
  const threshold = highestReachedThreshold(usage.percent, env.R2_STORAGE_ALERT_PERCENTS);

  if (threshold == null) {
    return { usage, threshold, notified: false, reason: "below thresholds" };
  }

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true, deletedAt: null },
    select: { id: true },
  });
  const subscribedChannels = await prisma.notificationChannel.count({
    where: {
      userId: { in: admins.map((a) => a.id) },
      isActive: true,
      events: { has: "SYSTEM_ALERT" },
    },
  });

  if (subscribedChannels === 0) {
    // Don't consume the weekly slot — retry tomorrow once someone subscribes.
    console.warn(
      `⚠️ R2 storage at ${usage.percent.toFixed(1)}% but no ADMIN has a Discord channel subscribed to SYSTEM_ALERT`,
    );
    return { usage, threshold, notified: false, reason: "no subscribed admin channel" };
  }

  if (!(await acquireOnceLock(alertKey(threshold), REALERT_AFTER_SECONDS))) {
    return { usage, threshold, notified: false, reason: "already alerted this week" };
  }

  const isFull = usage.percent >= 100;
  const message = {
    embeds: [
      buildInvestmentEmbed({
        title: isFull ? "🚨 พื้นที่เก็บสลิป (R2) เต็มโควต้าแล้ว" : `⚠️ พื้นที่เก็บสลิป (R2) ใช้ไปแล้ว ${usage.percent.toFixed(1)}%`,
        description: isFull
          ? "เกินโควต้าที่ตั้งไว้ อาจเริ่มมีค่าใช้จ่าย — ตรวจสอบ billing ใน Cloudflare dashboard"
          : `ถึงเกณฑ์แจ้งเตือน ${threshold}% ของโควต้า`,
        color: isFull ? 0xe74c3c : 0xf39c12,
        fields: [
          { name: "ใช้ไป", value: formatBytes(usage.usedBytes), inline: true },
          { name: "โควต้า", value: formatBytes(usage.quotaBytes), inline: true },
          { name: "จำนวนไฟล์", value: usage.objectCount.toLocaleString(), inline: true },
        ],
      }),
    ],
  };

  try {
    await Promise.all(admins.map((admin) => notifyEvent(admin.id, "SYSTEM_ALERT", message)));
  } catch (err) {
    // Couldn't even queue the notification — free the slot so tomorrow's run retries.
    await redis.del(alertKey(threshold));
    throw err;
  }

  return { usage, threshold, notified: true };
}
