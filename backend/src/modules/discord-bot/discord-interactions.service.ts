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
const SLIP_PORTFOLIO_OPTION = 'portfolio';
const SLIP_NUMBER_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
const AUTOCOMPLETE_MAX_CHOICES = 25;
const CHOICE_NAME_MAX = 100;

// Discord interaction type numbers (from Discord's API spec, not ours to rename).
const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_AUTOCOMPLETE = 4;
const RESPONSE_TYPE_PONG = 1;
const RESPONSE_TYPE_CHANNEL_MESSAGE = 4;
const RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE = 5;
const RESPONSE_TYPE_AUTOCOMPLETE_RESULT = 8;

interface DiscordAttachment {
  id: string;
  url: string;
  content_type?: string;
  size?: number;
}

interface DiscordInteractionOption {
  name: string;
  value: string;
  /** Set on the option the user is typing in, for autocomplete interactions. */
  focused?: boolean;
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
  data?: { content: string } | { choices: { name: string; value: string }[] };
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

  if (interaction.type === INTERACTION_TYPE_AUTOCOMPLETE) {
    return handleAutocomplete(interaction, discordUserId);
  }

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
 * /upload-slip's `portfolio` option: the user's portfolios whose name contains what
 * they've typed. The choice's value is the portfolio id. An unlinked user gets no
 * choices — the command itself then explains /link.
 */
async function handleAutocomplete(
  interaction: DiscordInteraction,
  discordUserId: string,
): Promise<DiscordInteractionResponse> {
  const focused = interaction.data?.options?.find((o) => o.focused);
  if (interaction.data?.name !== 'upload-slip' || focused?.name !== SLIP_PORTFOLIO_OPTION) {
    return { type: RESPONSE_TYPE_AUTOCOMPLETE_RESULT, data: { choices: [] } };
  }

  const portfolios = await prisma.portfolio.findMany({
    where: {
      user: { discordUserId },
      deletedAt: null,
      name: { contains: String(focused.value ?? '').trim(), mode: 'insensitive' },
    },
    select: { id: true, name: true, type: true },
    orderBy: { name: 'asc' },
    take: AUTOCOMPLETE_MAX_CHOICES,
  });

  return {
    type: RESPONSE_TYPE_AUTOCOMPLETE_RESULT,
    data: {
      choices: portfolios.map((p) => ({ name: `${p.name} (${p.type})`.slice(0, CHOICE_NAME_MAX), value: p.id })),
    },
  };
}

/**
 * The `portfolio` option is normally an id picked from autocomplete, but Discord also
 * lets the user send whatever they typed — so accept an exact name too.
 */
async function resolvePortfolioOption(
  userId: string,
  value: string | undefined,
): Promise<{ id: string; name: string } | null | 'not_found'> {
  const typed = value?.trim();
  if (!typed) return null;
  const portfolio = await prisma.portfolio.findFirst({
    where: {
      userId,
      deletedAt: null,
      OR: [{ id: typed }, { name: { equals: typed, mode: 'insensitive' } }],
    },
    select: { id: true, name: true },
  });
  return portfolio ?? 'not_found';
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

    const portfolioValue = interaction.data?.options?.find((o) => o.name === SLIP_PORTFOLIO_OPTION)?.value;
    const portfolio = await resolvePortfolioOption(user.id, portfolioValue);
    if (portfolio === 'not_found') {
      await patchFollowup(followupUrl, `❌ ไม่พบพอร์ต "${portfolioValue}" — เลือกจากรายการที่ขึ้นมาตอนพิมพ์`);
      return;
    }
    const scope = portfolio ? `ในพอร์ต "${portfolio.name}"` : 'ในทุกพอร์ต';

    const lines = attachments.map(() => '⏳ กำลังดาวน์โหลด...');
    const render = () =>
      patchFollowup(
        followupUrl,
        `📥 กำลังตรวจสลิป ${attachments.length} รูป ${scope}\n\n` +
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
        portfolioId: portfolio?.id,
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

    const summaries = await loadTransactionSummaries(
      results.flatMap((r) =>
        r.status === 'matched' ? [r.slip.transactionId] : r.status === 'ambiguous' ? r.candidateIds : [],
      ),
    );
    results.forEach((result, k) => {
      lines[toRead[k]!.index] = describeResult(result, summaries);
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

/** "BUY 10 AAPL · พอร์ต US Growth · 27 Oct 2026" per transaction id. */
async function loadTransactionSummaries(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const transactions = await prisma.transaction.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      type: true,
      mainAssetId: true,
      mainQuantity: true,
      executedAt: true,
      portfolio: { select: { name: true } },
    },
  });
  const assetIds = [...new Set(transactions.flatMap((t) => (t.mainAssetId ? [t.mainAssetId] : [])))];
  const assets = await prisma.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, symbol: true } });
  const symbolById = new Map(assets.map((a) => [a.id, a.symbol]));

  return new Map(
    transactions.map((t) => {
      const symbol = t.mainAssetId ? symbolById.get(t.mainAssetId) : undefined;
      const quantity = t.mainQuantity != null ? Number(t.mainQuantity).toLocaleString('en-US', { maximumFractionDigits: 8 }) : null;
      const what = [t.type, symbol && quantity ? `${quantity} ${symbol}` : symbol].filter(Boolean).join(' ');
      const day = t.executedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
      return [t.id, `${what} · พอร์ต "${t.portfolio.name}" · ${day}`];
    }),
  );
}

/** The final status line for one slip. */
function describeResult(result: SlipBatchItemResult, summaries: Map<string, string> = new Map()): string {
  const summarize = (id: string) => summaries.get(id) ?? `Transaction \`${id}\``;
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
        ? `✅ ${describeSlip(result.extracted)}\n   → ${summarize(result.slip.transactionId)}`
        : `✅ ${describeSlip(result.extracted)}\n   → ${summarize(result.slip.transactionId)}\n   ⚠️ จับคู่ผ่านอัตราแลกเปลี่ยน — ยอดไม่ตรงเป๊ะ กรุณาตรวจสอบ`;
    case 'duplicate':
      return `❌ ${describeSlip(result.extracted)}\n   สลิปนี้เคยถูกใช้กับธุรกรรมอื่นแล้ว`;
    case 'ambiguous':
      return (
        `⚠️ ${describeSlip(result.extracted)}\n   พบธุรกรรมที่ตรงกันหลายรายการ — ไม่ได้บันทึก\n` +
        result.candidateIds.map((id) => `   • ${summarize(id)}\n`).join('') +
        `   ส่งใหม่โดยเลือก portfolio หรือแนบสลิปกับ transaction เองในแอป`
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
