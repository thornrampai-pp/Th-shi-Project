import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { env } from '../../config/env';
import { autoMatchSlips } from '../transaction/slip.service';
import type { SlipBatchItemResult, SlipUpload } from '../transaction/slip.service';
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
 * All slips go to Gemini in ONE request (autoMatchSlips), then are matched one after
 * another so two can't claim the same transaction. One status line per slip; the
 * deferred reply is re-rendered whenever a line changes.
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

    const lines = attachments.map(() => '⏳ กำลังดาวน์โหลด...');
    const render = () =>
      patchFollowup(
        followupUrl,
        `📥 กำลังตรวจสลิป ${attachments.length} รูป\n\n` +
          lines.map((line, i) => `${SLIP_NUMBER_EMOJI[i]} ${line}`).join('\n\n'),
      );
    await render();

    // Download everything first; a file that can't be fetched just gets its own error line.
    const downloads = await Promise.all(attachments.map(downloadAttachment));
    const toRead = downloads.flatMap((d, i) => ('imageBase64' in d ? [{ index: i, upload: d }] : []));
    downloads.forEach((d, i) => {
      lines[i] = 'error' in d ? d.error : '⏳ กำลังอ่านสลิป...';
    });
    await render();
    if (toRead.length === 0) return;

    const results = await autoMatchSlips(
      user.id,
      toRead.map((r) => r.upload),
      {
        onAttemptFailed: async (attempt, max) => {
          for (const { index } of toRead) {
            lines[index] =
              attempt < max
                ? `⏳ attempt ${attempt}/${max} failed, retrying...`
                : `❌ attempt ${attempt}/${max} failed — ข้ามสลิปนี้`;
          }
          await render();
        },
      },
    );

    results.forEach((result, k) => {
      lines[toRead[k]!.index] = describeResult(result);
    });
    await render();
  } catch (err) {
    await patchFollowup(
      followupUrl,
      `❌ อ่านสลิปไม่สำเร็จ: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }
}

async function downloadAttachment(attachment: DiscordAttachment): Promise<SlipUpload | { error: string }> {
  if (attachment.size != null && attachment.size > env.SLIP_MAX_BYTES) {
    return { error: `❌ ไฟล์ใหญ่เกินไป (สูงสุด ${(env.SLIP_MAX_BYTES / (1024 * 1024)).toFixed(1)} MB)` };
  }
  try {
    const response = await fetch(attachment.url);
    if (!response.ok) return { error: `❌ ดาวน์โหลดรูปจาก Discord ไม่สำเร็จ (${response.status})` };
    return {
      imageBase64: Buffer.from(await response.arrayBuffer()).toString('base64'),
      mimeType: attachment.content_type,
    };
  } catch {
    return { error: '❌ ดาวน์โหลดรูปจาก Discord ไม่สำเร็จ' };
  }
}

/** The final status line for one slip. */
function describeResult(result: SlipBatchItemResult): string {
  switch (result.status) {
    case 'invalid':
      return `❌ ไฟล์ไม่ถูกต้อง: ${result.message}`;
    case 'extraction_failed':
      // The progress line already shows the attempt count; this says why it stopped.
      return `❌ อ่านสลิปไม่สำเร็จ — ข้ามสลิปนี้\n   ${result.message.slice(0, 180)}`;
    case 'unreadable':
      return `❌ ${describeSlip(result.extracted)}\n   อ่านยอดเงินหรือเลขอ้างอิงไม่ได้ — ลองรูปที่ชัดกว่านี้`;
    case 'error':
      return `❌ ${describeSlip(result.extracted)}\n   ${result.message}`;
    case 'matched':
      return result.slip.isAmountMatched
        ? `✅ ${describeSlip(result.extracted)} → Transaction \`${result.slip.transactionId}\``
        : `✅ ${describeSlip(result.extracted)} → Transaction \`${result.slip.transactionId}\`\n   ⚠️ จับคู่ผ่านอัตราแลกเปลี่ยน — ยอดไม่ตรงเป๊ะ กรุณาตรวจสอบ`;
    case 'duplicate':
      return `❌ ${describeSlip(result.extracted)}\n   สลิปนี้เคยถูกใช้กับธุรกรรมอื่นแล้ว`;
    case 'ambiguous':
      return (
        `⚠️ ${describeSlip(result.extracted)}\n   พบธุรกรรมที่ตรงกันหลายรายการ — ไม่ได้บันทึก\n` +
        `   ${result.candidateIds.map((id) => `\`${id}\``).join(', ')}\n` +
        `   ใช้ uploadTransactionSlip ในแอประบุ transaction เอง`
      );
    case 'not_found':
      return (
        `❌ ${describeSlip(result.extracted)}\n   assetSymbol: ${result.extracted.assetSymbol ?? '-'}\n` +
        `   ⚠️ ไม่พบธุรกรรม สร้าง transaction ใหม่แล้ว upload อีกครั้ง`
      );
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
