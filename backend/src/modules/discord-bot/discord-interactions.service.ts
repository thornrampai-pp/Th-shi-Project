import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { env } from '../../config/env';
import { GEMINI_MAX_ATTEMPTS, autoMatchSlip } from '../transaction/slip.service';
import type { SlipExtraction } from '../../common/integrations/gemini.util';

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_MESSAGE_LIMIT = 2000;

// Must match the option names in scripts/register-discord-commands.ts.
const SLIP_IMAGE_OPTIONS = ['image1', 'image2', 'image3', 'image4', 'image5'];
const SLIP_NUMBER_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

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

/**
 * Slips are processed one at a time (Gemini rate limits, and two slips in one batch
 * must never race for the same transaction). One status line per slip, and the
 * deferred reply is re-rendered every time a line changes.
 */
async function processUploadSlipAsync(interaction: DiscordInteraction, discordUserId: string): Promise<void> {
  const followupUrl = `${DISCORD_API}/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;

  try {
    const user = await prisma.user.findUnique({ where: { discordUserId } });
    if (!user) {
      await patchFollowup(followupUrl, '❌ ยังไม่ได้เชื่อมบัญชี Discord กับแอป — รัน /link ก่อน');
      return;
    }

    const attachments = SLIP_IMAGE_OPTIONS.map((name) => {
      const attachmentId = interaction.data?.options?.find((o) => o.name === name)?.value;
      return attachmentId ? interaction.data?.resolved?.attachments?.[attachmentId] : undefined;
    }).filter((a): a is DiscordAttachment => a != null);

    if (attachments.length === 0) {
      await patchFollowup(followupUrl, '❌ กรุณาแนบรูปสลิปอย่างน้อย 1 รูป');
      return;
    }

    const lines = attachments.map(() => '⏳ รอคิว...');
    const render = () =>
      patchFollowup(
        followupUrl,
        `📥 กำลังตรวจสลิป ${attachments.length} รูป\n\n` +
          lines.map((line, i) => `${SLIP_NUMBER_EMOJI[i]} ${line}`).join('\n\n'),
      );

    for (const [i, attachment] of attachments.entries()) {
      lines[i] = '⏳ กำลังอ่านสลิป...';
      await render();
      lines[i] = await processOneSlip(user.id, attachment, async (attempt, max) => {
        lines[i] =
          attempt < max
            ? `⏳ attempt ${attempt}/${max} failed, retrying...`
            : `❌ attempt ${attempt}/${max} failed — ข้ามสลิปนี้`;
        await render();
      });
      await render();
    }
  } catch (err) {
    await patchFollowup(
      followupUrl,
      `❌ อ่านสลิปไม่สำเร็จ: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }
}

/** Returns the final status line for one slip; never throws. */
async function processOneSlip(
  userId: string,
  attachment: DiscordAttachment,
  onAttemptFailed: (attempt: number, maxAttempts: number) => Promise<void>,
): Promise<string> {
  if (attachment.size != null && attachment.size > env.SLIP_MAX_BYTES) {
    return `❌ ไฟล์ใหญ่เกินไป (สูงสุด ${(env.SLIP_MAX_BYTES / (1024 * 1024)).toFixed(1)} MB)`;
  }

  try {
    const imageResponse = await fetch(attachment.url);
    if (!imageResponse.ok) {
      return `❌ ดาวน์โหลดรูปจาก Discord ไม่สำเร็จ (${imageResponse.status})`;
    }
    const imageBase64 = Buffer.from(await imageResponse.arrayBuffer()).toString('base64');

    const result = await autoMatchSlip(userId, imageBase64, attachment.content_type, { onAttemptFailed });

    if (result.status === 'extraction_failed') {
      return `❌ attempt ${GEMINI_MAX_ATTEMPTS}/${GEMINI_MAX_ATTEMPTS} failed — ข้ามสลิปนี้`;
    }

    const summary = describeSlip(result.extracted);

    switch (result.status) {
      case 'matched':
        return result.slip.isAmountMatched
          ? `✅ ${summary} → Transaction \`${result.slip.transactionId}\``
          : `✅ ${summary} → Transaction \`${result.slip.transactionId}\`\n   ⚠️ จับคู่ผ่านอัตราแลกเปลี่ยน — ยอดไม่ตรงเป๊ะ กรุณาตรวจสอบ`;
      case 'duplicate':
        return `❌ ${summary}\n   สลิปนี้เคยถูกใช้กับธุรกรรมอื่นแล้ว`;
      case 'ambiguous':
        return (
          `⚠️ ${summary}\n   พบธุรกรรมที่ตรงกันหลายรายการ — ไม่ได้บันทึก\n` +
          `   ${result.candidateIds.map((id) => `\`${id}\``).join(', ')}\n` +
          `   ใช้ uploadTransactionSlip ในแอประบุ transaction เอง`
        );
      case 'not_found':
        return (
          `❌ ${summary}\n   assetSymbol: ${result.extracted.assetSymbol ?? '-'}\n` +
          `   ⚠️ ไม่พบธุรกรรม สร้าง transaction ใหม่แล้ว upload อีกครั้ง`
        );
    }
  } catch (err) {
    return `❌ อ่านสลิปไม่สำเร็จ: ${err instanceof Error ? err.message : 'unknown error'}`;
  }
}

function describeSlip(extracted: SlipExtraction): string {
  const amount =
    extracted.amount != null
      ? extracted.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '-';
  return `ยอด ${amount} ${extracted.currency ?? 'THB'}, Ref: ${extracted.transRef ?? '-'}`;
}

async function patchFollowup(url: string, content: string): Promise<void> {
  const truncated =
    content.length > DISCORD_MESSAGE_LIMIT ? `${content.slice(0, DISCORD_MESSAGE_LIMIT - 1)}…` : content;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: truncated }),
  });
}
