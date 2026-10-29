import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { autoMatchSlips } from '../transaction/slip.service';
import {
  CHOICE_NAME_MAX,
  INTERACTION_TYPE_AUTOCOMPLETE,
  INTERACTION_TYPE_COMPONENT,
  INTERACTION_TYPE_MODAL_SUBMIT,
  INTERACTION_TYPE_PING,
  RESPONSE_TYPE_AUTOCOMPLETE_RESULT,
  RESPONSE_TYPE_CHANNEL_MESSAGE,
  RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE,
  RESPONSE_TYPE_PONG,
  SELECT_MAX_OPTIONS,
  discordUserIdOf,
  editMessage,
  originalMessageUrl,
  postFollowup,
} from './discord-api';
import type { DiscordAttachment, DiscordInteraction, DiscordInteractionResponse, DiscordMessage } from './discord-api';
import { describeResult, loadTransactionSummaries, transactionIdsOf } from './slip-messages';
import { downloadAttachment, handleSlipInteraction, isSlipCustomId, needsPrompt, openSlipPrompt } from './slip-prompts';

export type { DiscordInteraction, DiscordInteractionResponse } from './discord-api';

// Must match the option names in scripts/register-discord-commands.ts.
const SLIP_IMAGE_OPTIONS = ['image1', 'image2', 'image3', 'image4', 'image5'];
const SLIP_PORTFOLIO_OPTION = 'portfolio';
const SLIP_NUMBER_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

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
 *
 * Buttons, selects and forms on the slip prompts it posts go to handleSlipInteraction().
 */
export async function handleInteraction(interaction: DiscordInteraction): Promise<DiscordInteractionResponse> {
  const discordUserId = discordUserIdOf(interaction);
  if (!discordUserId) {
    return { type: RESPONSE_TYPE_CHANNEL_MESSAGE, data: { content: '❌ ไม่พบข้อมูลผู้ใช้ Discord' } };
  }

  const commandName = interaction.data?.name;

  if (interaction.type === INTERACTION_TYPE_AUTOCOMPLETE) {
    return handleAutocomplete(interaction, discordUserId);
  }

  if (
    (interaction.type === INTERACTION_TYPE_COMPONENT || interaction.type === INTERACTION_TYPE_MODAL_SUBMIT) &&
    isSlipCustomId(interaction.data?.custom_id)
  ) {
    return handleSlipInteraction(interaction, discordUserId);
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
    take: SELECT_MAX_OPTIONS,
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
 *
 * A slip with no match is recorded as a new transaction when the slip says enough;
 * otherwise — or when several transactions match — it gets its own follow-up message
 * asking the user (see slip-prompts.ts).
 */
async function processUploadSlipAsync(interaction: DiscordInteraction, discordUserId: string): Promise<void> {
  const followupUrl = originalMessageUrl(interaction);

  try {
    const user = await prisma.user.findUnique({ where: { discordUserId } });
    if (!user) {
      await editMessage(followupUrl, '❌ ยังไม่ได้เชื่อมบัญชี Discord กับแอป — รัน /link ก่อน');
      return;
    }

    const attachments = SLIP_IMAGE_OPTIONS.map((name) => {
      const attachmentId = interaction.data?.options?.find((o) => o.name === name)?.value;
      return attachmentId ? interaction.data?.resolved?.attachments?.[attachmentId] : undefined;
    }).filter((a): a is DiscordAttachment => a != null);

    if (attachments.length === 0) {
      await editMessage(followupUrl, '❌ กรุณาแนบรูปสลิปอย่างน้อย 1 รูป');
      return;
    }

    const portfolioValue = interaction.data?.options?.find((o) => o.name === SLIP_PORTFOLIO_OPTION)?.value;
    const portfolio = await resolvePortfolioOption(user.id, portfolioValue);
    if (portfolio === 'not_found') {
      await editMessage(followupUrl, `❌ ไม่พบพอร์ต "${portfolioValue}" — เลือกจากรายการที่ขึ้นมาตอนพิมพ์`);
      return;
    }
    const scope = portfolio ? `ในพอร์ต "${portfolio.name}"` : 'ในทุกพอร์ต';

    const lines = attachments.map(() => '⏳ กำลังดาวน์โหลด...');
    const render = () =>
      editMessage(
        followupUrl,
        `📥 กำลังตรวจสลิป ${attachments.length} รูป ${scope}\n\n` +
          lines.map((line, i) => `${SLIP_NUMBER_EMOJI[i]} ${line}`).join('\n\n'),
      );
    await render();

    // Download everything first; a file that can't be fetched just gets its own error line.
    const downloads = await Promise.all(
      attachments.map((a) => downloadAttachment({ url: a.url, contentType: a.content_type, size: a.size })),
    );
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
        createMissing: true,
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

    const summaries = await loadTransactionSummaries(results.flatMap(transactionIdsOf));
    const prompts: DiscordMessage[] = [];
    for (const [k, result] of results.entries()) {
      const index = toRead[k]!.index;
      lines[index] = describeResult(result, summaries);
      if (needsPrompt(result)) {
        prompts.push(
          await openSlipPrompt({
            userId: user.id,
            discordUserId,
            attachment: attachments[index]!,
            result,
            portfolioId: portfolio?.id ?? null,
            slipLabel: SLIP_NUMBER_EMOJI[index]!,
          }),
        );
      }
    }
    await render();
    // In order, so they read top to bottom like the summary above.
    for (const prompt of prompts) await postFollowup(interaction, prompt);
  } catch (err) {
    await editMessage(
      followupUrl,
      `❌ อ่านสลิปไม่สำเร็จ: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }
}
