// Slips /upload-slip couldn't settle on its own get a follow-up message asking the user:
// which of several matching transactions it is, which portfolio a new one goes in, or
// to fill in / check the trade before it's recorded. The slip waits in Redis meanwhile.
import { randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { env } from '../../config/env';
import type { SlipExtraction } from '../../common/integrations/gemini.util';
import {
  attachReadSlip,
  createTransactionFromSlip,
  draftFromSlip,
  missingDraftFields,
} from '../transaction/slip.service';
import type { SlipBatchItemResult, SlipTradeDraft, SlipUpload } from '../transaction/slip.service';
import {
  MESSAGE_FLAG_EPHEMERAL,
  RESPONSE_TYPE_CHANNEL_MESSAGE,
  RESPONSE_TYPE_DEFERRED_UPDATE_MESSAGE,
  RESPONSE_TYPE_MODAL,
  RESPONSE_TYPE_UPDATE_MESSAGE,
  SELECT_MAX_OPTIONS,
  actionRow,
  button,
  editMessage,
  modalValues,
  originalMessageUrl,
  stringSelect,
  textInputRow,
} from './discord-api';
import type { DiscordAttachment, DiscordInteraction, DiscordInteractionResponse, DiscordMessage, DiscordModal } from './discord-api';
import { describeDraft, describeResult, describeSlip, loadTransactionSummaries, transactionIdsOf } from './slip-messages';

/** A slip left unanswered this long is dropped; the user sends it again. */
const PENDING_TTL_SECONDS = 60 * 60;
/** Guards against a double click recording the same trade twice. */
const LOCK_TTL_SECONDS = 120;
const CUSTOM_ID_PREFIX = 'slip';

interface PendingSlip {
  userId: string;
  discordUserId: string;
  /** Discord's CDN link to the uploaded image, fetched again when the slip is saved. */
  attachment: { url: string; contentType?: string; size?: number };
  extracted: SlipExtraction;
  /** Set while the user is picking between matching transactions. */
  candidateIds: string[];
  portfolioId: string | null;
  draft: SlipTradeDraft;
  /** Why the last attempt didn't go through, shown on the prompt. */
  message: string | null;
}

type PromptableResult = Extract<SlipBatchItemResult, { status: 'ambiguous' | 'needs_input' }>;

export function needsPrompt(result: SlipBatchItemResult): result is PromptableResult {
  return result.status === 'ambiguous' || result.status === 'needs_input';
}

export function isSlipCustomId(customId: string | undefined): boolean {
  return customId?.startsWith(`${CUSTOM_ID_PREFIX}:`) ?? false;
}

/** Saves the slip and returns the message to post under the /upload-slip reply. */
export async function openSlipPrompt(params: {
  userId: string;
  discordUserId: string;
  attachment: DiscordAttachment;
  result: PromptableResult;
  /** The command's `portfolio` option, so a new transaction goes there without asking. */
  portfolioId: string | null;
  slipLabel: string;
}): Promise<DiscordMessage> {
  const { result } = params;
  const id = randomUUID();
  const pending: PendingSlip = {
    userId: params.userId,
    discordUserId: params.discordUserId,
    attachment: { url: params.attachment.url, contentType: params.attachment.content_type, size: params.attachment.size },
    extracted: result.extracted,
    candidateIds: result.status === 'ambiguous' ? result.candidateIds : [],
    portfolioId: result.status === 'needs_input' ? result.portfolioId : params.portfolioId,
    draft: result.status === 'needs_input' ? result.draft : draftFromSlip(result.extracted),
    message: result.status === 'needs_input' ? result.message : null,
  };
  await save(id, pending);
  const prompt = await promptFor(id, pending);
  return { ...prompt, content: `${params.slipLabel} ${prompt.content}` };
}

export async function handleSlipInteraction(
  interaction: DiscordInteraction,
  discordUserId: string,
): Promise<DiscordInteractionResponse> {
  const [, action, id] = (interaction.data?.custom_id ?? '').split(':');
  const pending = id ? await load(id) : null;
  if (!id || !pending) {
    return update({ content: '⌛ หมดเวลาแล้ว — ส่ง /upload-slip ใหม่อีกครั้ง', components: [] });
  }
  if (pending.discordUserId !== discordUserId) {
    return ephemeral('❌ สลิปนี้เป็นของผู้ใช้คนอื่น');
  }

  switch (action) {
    case 'cancel':
      await redis.del(key(id));
      return update({ content: `🚫 ${describeSlip(pending.extracted)}\n   ยกเลิกแล้ว — ไม่ได้บันทึกอะไร`, components: [] });

    case 'pick': {
      const transactionId = interaction.data?.values?.[0];
      if (!transactionId || !pending.candidateIds.includes(transactionId)) return ephemeral('❌ ไม่พบรายการนี้');
      return runLocked(interaction, id, pending, (upload) =>
        attachReadSlip(pending.userId, transactionId, upload, pending.extracted),
      );
    }

    case 'new':
      pending.candidateIds = [];
      await save(id, pending);
      return nextStep(interaction, id, pending);

    case 'portfolio': {
      const portfolioId = interaction.data?.values?.[0];
      const owned = portfolioId
        ? await prisma.portfolio.findFirst({ where: { id: portfolioId, userId: pending.userId, deletedAt: null } })
        : null;
      if (!owned) return ephemeral('❌ ไม่พบพอร์ตนี้');
      pending.portfolioId = owned.id;
      await save(id, pending);
      return nextStep(interaction, id, pending);
    }

    case 'change':
      pending.portfolioId = null;
      await save(id, pending);
      return update(await promptFor(id, pending));

    case 'form':
      return { type: RESPONSE_TYPE_MODAL, data: formFor(id, pending) };

    case 'submit': {
      const { draft, error } = parseForm(modalValues(interaction));
      pending.draft = draft;
      pending.message = error;
      await save(id, pending);
      if (error) return update(await promptFor(id, pending));
      return runLocked(interaction, id, pending, (upload) => createFrom(pending, upload, true));
    }
  }

  return ephemeral('❌ ไม่รู้จักคำสั่งนี้');
}

/** After the transaction/portfolio choice: ask for what's missing, or record it. */
async function nextStep(
  interaction: DiscordInteraction,
  id: string,
  pending: PendingSlip,
): Promise<DiscordInteractionResponse> {
  if (!pending.portfolioId) return update(await promptFor(id, pending));
  const ready =
    missingDraftFields(pending.draft).length === 0 && pending.extracted.confidence !== 'low' && !pending.message;
  if (!ready) return { type: RESPONSE_TYPE_MODAL, data: formFor(id, pending) };
  return runLocked(interaction, id, pending, (upload) => createFrom(pending, upload, false));
}

function createFrom(pending: PendingSlip, upload: SlipUpload, confirmed: boolean) {
  return createTransactionFromSlip(pending.userId, pending.portfolioId!, upload, pending.extracted, pending.draft, confirmed);
}

/**
 * Acks at once (Discord waits ~3s) and saves in the background — downloading the image
 * again and the DB work take longer. The prompt message is then edited to the outcome,
 * or back to a prompt explaining what still needs fixing.
 */
async function runLocked(
  interaction: DiscordInteraction,
  id: string,
  pending: PendingSlip,
  work: (upload: SlipUpload) => Promise<SlipBatchItemResult>,
): Promise<DiscordInteractionResponse> {
  const locked = await redis.set(lockKey(id), '1', 'EX', LOCK_TTL_SECONDS, 'NX');
  if (!locked) return ephemeral('⏳ กำลังบันทึกสลิปนี้อยู่');

  const url = originalMessageUrl(interaction);
  void (async () => {
    try {
      const upload = await downloadAttachment(pending.attachment);
      if ('error' in upload) {
        pending.message = upload.error;
        await save(id, pending);
        await editMessage(url, await promptFor(id, pending));
        return;
      }
      const result = await work(upload);

      if (result.status === 'needs_input' || result.status === 'error') {
        if (result.status === 'needs_input') {
          pending.portfolioId = result.portfolioId ?? pending.portfolioId;
          pending.draft = result.draft;
        }
        pending.message = result.message ?? (result.status === 'needs_input' ? 'ตรวจข้อมูลก่อนบันทึก' : null);
        await save(id, pending);
        await editMessage(url, await promptFor(id, pending));
        return;
      }

      await redis.del(key(id));
      const summaries = await loadTransactionSummaries(transactionIdsOf(result));
      await editMessage(url, { content: describeResult(result, summaries), components: [] });
    } catch (err) {
      console.error('❌ Discord slip prompt failed:', err);
      pending.message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด — ลองอีกครั้ง';
      await save(id, pending).catch(() => undefined);
      await editMessage(url, await promptFor(id, pending)).catch(() => undefined);
    } finally {
      await redis.del(lockKey(id));
    }
  })();

  return { type: RESPONSE_TYPE_DEFERRED_UPDATE_MESSAGE };
}

async function promptFor(id: string, pending: PendingSlip): Promise<DiscordMessage> {
  const header = `🧾 ${describeSlip(pending.extracted)}`;
  const note = pending.message ? `\n⚠️ ${pending.message}` : '';
  const cancel = button(customId('cancel', id), 'ยกเลิก');

  if (pending.candidateIds.length > 0) {
    const summaries = await loadTransactionSummaries(pending.candidateIds);
    return {
      content: `${header}\nพบหลายรายการที่ตรงกัน — เลือกรายการของสลิปนี้ หรือสร้างรายการใหม่ถ้าไม่ใช่สักรายการ${note}`,
      components: [
        actionRow(
          stringSelect(
            customId('pick', id),
            'เลือกรายการ',
            pending.candidateIds.map((t) => ({ label: summaries.get(t) ?? t, value: t })),
          ),
        ),
        actionRow(button(customId('new', id), '➕ สร้างรายการใหม่', true), cancel),
      ],
    };
  }

  if (!pending.portfolioId) {
    const portfolios = await prisma.portfolio.findMany({
      where: { userId: pending.userId, deletedAt: null },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
      take: SELECT_MAX_OPTIONS,
    });
    if (portfolios.length === 0) {
      return { content: `${header}\nยังไม่มีพอร์ต — สร้างพอร์ตในแอปก่อน แล้วส่งสลิปใหม่`, components: [] };
    }
    return {
      content: `${header}\nไม่พบรายการที่ตรงกัน — เลือกพอร์ตที่จะเพิ่มรายการนี้${note}`,
      components: [
        actionRow(
          stringSelect(
            customId('portfolio', id),
            'เลือกพอร์ต',
            portfolios.map((p) => ({ label: `${p.name} (${p.type})`, value: p.id })),
          ),
        ),
        actionRow(cancel),
      ],
    };
  }

  const portfolio = await prisma.portfolio.findFirst({
    where: { id: pending.portfolioId, userId: pending.userId },
    select: { name: true },
  });
  const missing = missingDraftFields(pending.draft).length > 0;
  return {
    content:
      `${header}\nไม่พบรายการที่ตรงกัน — จะบันทึกใหม่ในพอร์ต "${portfolio?.name ?? '?'}"\n` +
      `${describeDraft(pending.draft)}\n` +
      (missing ? 'กรอกข้อมูลที่ขาด (❔) ก่อนบันทึก' : 'ตรวจข้อมูลแล้วกดบันทึก') +
      note,
    components: [
      actionRow(
        button(customId('form', id), missing ? '📝 กรอกข้อมูล' : '📝 ตรวจและบันทึก', true),
        button(customId('change', id), 'เปลี่ยนพอร์ต'),
        cancel,
      ),
    ],
  };
}

function formFor(id: string, pending: PendingSlip): DiscordModal {
  const { draft } = pending;
  const text = (value: number | null) => (value != null ? String(value) : null);
  return {
    custom_id: customId('submit', id),
    title: 'บันทึกรายการจากสลิป',
    components: [
      textInputRow('type', 'ประเภท (BUY หรือ SELL)', draft.type, true),
      textInputRow('symbol', 'หุ้น เช่น AAPL, PTT.BK', draft.symbol, true),
      textInputRow('quantity', 'จำนวนหุ้น/หน่วย', text(draft.quantity), true),
      textInputRow('price', 'ราคาต่อหน่วย (สกุลเงินของหุ้น)', text(draft.price), true),
      textInputRow('fee', 'ค่าธรรมเนียม (สกุลเงินของหุ้น, ไม่บังคับ)', text(draft.fee), false),
    ],
  };
}

/** Keeps every valid value (so the next form is pre-filled) and reports the first problem. */
function parseForm(values: Map<string, string>): { draft: SlipTradeDraft; error: string | null } {
  const errors: string[] = [];
  const number = (field: string, label: string, optional = false): number | null => {
    const raw = (values.get(field) ?? '').replace(/,/g, '');
    if (!raw) {
      if (!optional) errors.push(`กรอก${label}`);
      return null;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || (!optional && n === 0)) {
      errors.push(`${label}ไม่ถูกต้อง: "${raw}"`);
      return null;
    }
    return n;
  };

  const rawType = (values.get('type') ?? '').toUpperCase();
  const type = rawType === 'BUY' || rawType === 'SELL' ? rawType : null;
  if (!type) errors.push('ประเภทต้องเป็น BUY หรือ SELL');
  const symbol = (values.get('symbol') ?? '').toUpperCase() || null;
  if (!symbol) errors.push('กรอกชื่อหุ้น');

  const draft: SlipTradeDraft = {
    type,
    symbol,
    quantity: number('quantity', 'จำนวน'),
    price: number('price', 'ราคา'),
    fee: number('fee', 'ค่าธรรมเนียม', true),
  };
  return { draft, error: errors[0] ?? null };
}

export async function downloadAttachment(attachment: {
  url: string;
  contentType?: string;
  size?: number;
}): Promise<SlipUpload | { error: string }> {
  if (attachment.size != null && attachment.size > env.SLIP_MAX_BYTES) {
    return { error: `❌ ไฟล์ใหญ่เกินไป (สูงสุด ${(env.SLIP_MAX_BYTES / (1024 * 1024)).toFixed(1)} MB)` };
  }
  try {
    const response = await fetch(attachment.url);
    if (!response.ok) return { error: `❌ ดาวน์โหลดรูปจาก Discord ไม่สำเร็จ (${response.status})` };
    return {
      imageBase64: Buffer.from(await response.arrayBuffer()).toString('base64'),
      mimeType: attachment.contentType,
    };
  } catch {
    return { error: '❌ ดาวน์โหลดรูปจาก Discord ไม่สำเร็จ' };
  }
}

function update(message: DiscordMessage): DiscordInteractionResponse {
  return { type: RESPONSE_TYPE_UPDATE_MESSAGE, data: message };
}

function ephemeral(content: string): DiscordInteractionResponse {
  return { type: RESPONSE_TYPE_CHANNEL_MESSAGE, data: { content, flags: MESSAGE_FLAG_EPHEMERAL } };
}

function customId(action: string, id: string): string {
  return `${CUSTOM_ID_PREFIX}:${action}:${id}`;
}

function key(id: string): string {
  return `discord-slip:${id}`;
}

function lockKey(id: string): string {
  return `discord-slip-lock:${id}`;
}

async function save(id: string, pending: PendingSlip): Promise<void> {
  await redis.set(key(id), JSON.stringify(pending), 'EX', PENDING_TTL_SECONDS);
}

async function load(id: string): Promise<PendingSlip | null> {
  const raw = await redis.get(key(id));
  return raw ? (JSON.parse(raw) as PendingSlip) : null;
}
