import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { env } from '../../config/env';
import { uploadTransactionSlip } from '../transaction/slip.service';

const DISCORD_API = 'https://discord.com/api/v10';

// Discord interaction type numbers (from Discord's API spec, not ours to rename).
const INTERACTION_TYPE_PING = 1;
const RESPONSE_TYPE_PONG = 1;
const RESPONSE_TYPE_CHANNEL_MESSAGE = 4;
const RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE = 5;

interface DiscordAttachment {
  id: string;
  url: string;
  content_type?: string;
  size?: number;
}

interface DiscordInteractionOption {
  name: string;
  value: string;
}

export interface DiscordInteraction {
  type: number;
  token: string;
  member?: { user?: { id: string } };
  user?: { id: string };
  data?: {
    name: string;
    options?: DiscordInteractionOption[];
    resolved?: { attachments?: Record<string, DiscordAttachment> };
  };
}

export interface DiscordInteractionResponse {
  type: number;
  data?: { content: string };
}

export function isPing(interaction: DiscordInteraction): boolean {
  return interaction.type === INTERACTION_TYPE_PING;
}

export function pongResponse(): DiscordInteractionResponse {
  return { type: RESPONSE_TYPE_PONG };
}

/**
 * Handles a slash-command interaction. For /upload-slip specifically, this returns a
 * DEFERRED response immediately (Discord only waits ~3s for the initial reply, and
 * Gemini can take longer) — the real result is sent afterward via a follow-up PATCH
 * from processUploadSlipAsync(), fired without awaiting it here.
 */
export async function handleInteraction(interaction: DiscordInteraction): Promise<DiscordInteractionResponse> {
  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!discordUserId) {
    return { type: RESPONSE_TYPE_CHANNEL_MESSAGE, data: { content: '❌ ไม่พบข้อมูลผู้ใช้ Discord' } };
  }

  const commandName = interaction.data?.name;

  if (commandName === 'link') {
    return handleLinkCommand(interaction, discordUserId);
  }

  if (commandName === 'upload-slip') {
    processUploadSlipAsync(interaction, discordUserId).catch((err) => {
      console.error('❌ Discord upload-slip processing failed:', err);
    });
    return { type: RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE };
  }

  return { type: RESPONSE_TYPE_CHANNEL_MESSAGE, data: { content: '❌ ไม่รู้จักคำสั่งนี้' } };
}

async function handleLinkCommand(
  interaction: DiscordInteraction,
  discordUserId: string,
): Promise<DiscordInteractionResponse> {
  const code = interaction.data?.options?.find((o) => o.name === 'code')?.value;
  if (!code) {
    return { type: RESPONSE_TYPE_CHANNEL_MESSAGE, data: { content: '❌ กรุณาระบุโค้ดที่ได้จากแอป' } };
  }

  const userId = await redis.get(`discord-link:${code}`);
  if (!userId) {
    return {
      type: RESPONSE_TYPE_CHANNEL_MESSAGE,
      data: { content: '❌ โค้ดไม่ถูกต้องหรือหมดอายุแล้ว — ขอโค้ดใหม่จากแอป' },
    };
  }

  const existingLink = await prisma.user.findUnique({ where: { discordUserId } });
  if (existingLink && existingLink.id !== userId) {
    return {
      type: RESPONSE_TYPE_CHANNEL_MESSAGE,
      data: { content: '❌ บัญชี Discord นี้เชื่อมกับบัญชีอื่นอยู่แล้ว' },
    };
  }

  await prisma.user.update({ where: { id: userId }, data: { discordUserId } });
  await redis.del(`discord-link:${code}`);

  return {
    type: RESPONSE_TYPE_CHANNEL_MESSAGE,
    data: { content: '✅ เชื่อมบัญชีสำเร็จ! ตอนนี้ส่งสลิปผ่าน /upload-slip ได้เลย' },
  };
}

async function processUploadSlipAsync(interaction: DiscordInteraction, discordUserId: string): Promise<void> {
  const followupUrl = `${DISCORD_API}/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;

  try {
    const user = await prisma.user.findUnique({ where: { discordUserId } });
    if (!user) {
      await patchFollowup(followupUrl, '❌ ยังไม่ได้เชื่อมบัญชี Discord กับแอป — รัน /link ก่อน');
      return;
    }

    const transactionId = interaction.data?.options?.find((o) => o.name === 'transaction_id')?.value;
    const attachmentId = interaction.data?.options?.find((o) => o.name === 'image')?.value;
    const attachment = attachmentId ? interaction.data?.resolved?.attachments?.[attachmentId] : undefined;

    if (!transactionId || !attachment) {
      await patchFollowup(followupUrl, '❌ ต้องระบุทั้ง transaction_id และแนบรูปสลิป');
      return;
    }

    if (attachment.size != null && attachment.size > env.SLIP_MAX_BYTES) {
      await patchFollowup(
        followupUrl,
        `❌ ไฟล์ใหญ่เกินไป (สูงสุด ${(env.SLIP_MAX_BYTES / (1024 * 1024)).toFixed(1)} MB)`,
      );
      return;
    }

    const imageResponse = await fetch(attachment.url);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const imageBase64 = imageBuffer.toString('base64');

    const slip = await uploadTransactionSlip(user.id, transactionId, imageBase64, attachment.content_type);

    const statusEmoji = slip.isAmountMatched ? '✅' : '⚠️';
    const statusText = slip.isAmountMatched ? 'ยอดตรงกัน' : 'ยอดไม่ตรง — กรุณาตรวจสอบ';
    await patchFollowup(
      followupUrl,
      `${statusEmoji} อ่านสลิปสำเร็จ\nยอดเงิน: ${Number(slip.amount).toLocaleString()} ${slip.currency}\nเลขอ้างอิง: ${slip.transRef}\nสถานะ: ${statusText}`,
    );
  } catch (err) {
    await patchFollowup(
      followupUrl,
      `❌ อ่านสลิปไม่สำเร็จ: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }
}

async function patchFollowup(url: string, content: string): Promise<void> {
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}
