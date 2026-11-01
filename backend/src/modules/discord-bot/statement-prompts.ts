// /upload-statement: rows whose asset is already held in exactly one portfolio go there
// on their own. Assets that aren't held anywhere yet (or in several portfolios) can't be
// placed without asking — this posts that question, with an option to create a portfolio.
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { AppError } from '../../common/errors/AppError';
import { createPortfolio } from '../portfolio/portfolio.service';
import { confirmStatement } from '../transaction/statement-import.service';
import type { StatementAssignment } from '../transaction/statement-import.service';
import {
  RESPONSE_TYPE_DEFERRED_UPDATE_MESSAGE,
  RESPONSE_TYPE_MODAL,
  RESPONSE_TYPE_UPDATE_MESSAGE,
  actionRow,
  button,
  editMessage,
  modalValues,
  originalMessageUrl,
  stringSelect,
  textInputRow,
} from './discord-api';
import type { DiscordInteraction, DiscordInteractionResponse, DiscordMessage } from './discord-api';
import { describeStatementResult } from './slip-messages';

const PREFIX = 'stmt';
const TTL_SECONDS = 60 * 60;
const key = (id: string) => `discord-statement:${id}`;
const lockKey = (id: string) => `discord-statement-lock:${id}`;
const customId = (action: string, id: string) => `${PREFIX}:${action}:${id}`;

interface PendingChoice {
  userId: string;
  discordUserId: string;
  /** Already decided (the asset is held in exactly one portfolio, or a default was given). */
  resolved: StatementAssignment[];
  /** Still needs a portfolio. */
  unresolvedSymbols: string[];
}

export function isStatementCustomId(id: string | undefined): boolean {
  return id?.startsWith(`${PREFIX}:`) ?? false;
}

/** Records everything and returns the summary text. */
export async function finishStatement(userId: string, statementId: string, assignments: StatementAssignment[]) {
  return describeStatementResult(await confirmStatement(userId, statementId, assignments));
}

export async function openStatementPrompt(params: {
  statementId: string;
  userId: string;
  discordUserId: string;
  resolved: StatementAssignment[];
  unresolvedSymbols: string[];
}): Promise<DiscordMessage> {
  const pending: PendingChoice = {
    userId: params.userId,
    discordUserId: params.discordUserId,
    resolved: params.resolved,
    unresolvedSymbols: params.unresolvedSymbols,
  };
  await redis.set(key(params.statementId), JSON.stringify(pending), 'EX', TTL_SECONDS);
  return promptFor(params.statementId, pending);
}

async function promptFor(id: string, pending: PendingChoice): Promise<DiscordMessage> {
  const portfolios = await prisma.portfolio.findMany({
    where: { userId: pending.userId, deletedAt: null },
    select: { id: true, name: true, type: true },
    orderBy: { name: 'asc' },
    take: 25,
  });
  const symbols = pending.unresolvedSymbols.join(', ');
  const known = pending.resolved.length > 0 ? `\n✅ อีก ${pending.resolved.length} ตัวเข้าพอร์ตที่ถืออยู่แล้วให้อัตโนมัติ` : '';
  const content =
    `📄 ${pending.unresolvedSymbols.length} ตัวนี้ยังไม่มีในพอร์ตไหน (หรืออยู่หลายพอร์ต): ${symbols}${known}\n` +
    'เลือกพอร์ตที่จะเพิ่มเข้าไป หรือสร้างพอร์ตใหม่';

  const newButton = button(customId('new', id), '➕ สร้างพอร์ตใหม่', portfolios.length === 0);
  const cancel = button(customId('cancel', id), 'ยกเลิก');
  return {
    content: content.slice(0, 1900),
    components:
      portfolios.length === 0
        ? [actionRow(newButton, cancel)]
        : [
            actionRow(
              stringSelect(
                customId('portfolio', id),
                'เลือกพอร์ต',
                portfolios.map((p) => ({ label: `${p.name} (${p.type})`, value: p.id })),
              ),
            ),
            actionRow(newButton, cancel),
          ],
  };
}

export async function handleStatementInteraction(
  interaction: DiscordInteraction,
  discordUserId: string,
): Promise<DiscordInteractionResponse> {
  const [, action, id] = (interaction.data?.custom_id ?? '').split(':');
  const raw = id ? await redis.get(key(id)) : null;
  const pending = raw ? (JSON.parse(raw) as PendingChoice) : null;
  if (!id || !pending) {
    return update({ content: '⌛ หมดเวลาแล้ว — ส่ง /upload-statement ใหม่อีกครั้ง', components: [] });
  }
  if (pending.discordUserId !== discordUserId) return update({ content: '❌ รายการนี้เป็นของผู้ใช้คนอื่น', components: [] });

  switch (action) {
    case 'cancel':
      await redis.del(key(id));
      return update({ content: '🚫 ยกเลิกแล้ว — ไม่ได้บันทึกอะไร', components: [] });

    case 'portfolio': {
      const portfolioId = interaction.data?.values?.[0];
      if (!portfolioId) return update(await promptFor(id, pending));
      return run(interaction, id, pending, async () => portfolioId);
    }

    case 'new':
      return {
        type: RESPONSE_TYPE_MODAL,
        data: {
          custom_id: customId('newsubmit', id),
          title: 'สร้างพอร์ตใหม่',
          components: [textInputRow('name', 'ชื่อพอร์ต', null, true)],
        },
      };

    case 'newsubmit': {
      const name = (modalValues(interaction).get('name') ?? '').trim();
      if (!name) return update(await promptFor(id, pending));
      // One portfolio for all the unplaced assets — created before anything is recorded.
      return run(interaction, id, pending, async () => {
        const created = await createPortfolio(pending.userId, { name, strategy: 'VALUE', baseCurrency: 'THB', type: 'REAL' });
        return created.id;
      });
    }
  }
  return update({ content: '❌ ไม่รู้จักคำสั่งนี้', components: [] });
}

/** Acks at once (Discord waits ~3s) and records in the background, then edits the message to the summary. */
async function run(
  interaction: DiscordInteraction,
  id: string,
  pending: PendingChoice,
  choosePortfolio: () => Promise<string>,
): Promise<DiscordInteractionResponse> {
  const locked = await redis.set(lockKey(id), '1', 'EX', 300, 'NX');
  if (!locked) return update({ content: '⏳ กำลังบันทึกอยู่', components: [] });

  const url = originalMessageUrl(interaction);
  void (async () => {
    try {
      await editMessage(url, { content: '⏳ กำลังบันทึกรายการ...', components: [] });
      const portfolioId = await choosePortfolio();
      const assignments: StatementAssignment[] = [
        ...pending.resolved,
        ...pending.unresolvedSymbols.map((symbol) => ({ symbol, portfolioId })),
      ];
      const summary = await finishStatement(pending.userId, id, assignments);
      await redis.del(key(id));
      await editMessage(url, { content: summary.slice(0, 1990), components: [] });
    } catch (err) {
      const message = err instanceof AppError || err instanceof Error ? err.message : 'unknown error';
      await editMessage(url, { content: `❌ นำเข้า statement ไม่สำเร็จ: ${message}`, components: [] }).catch(() => undefined);
    } finally {
      await redis.del(lockKey(id));
    }
  })();
  return { type: RESPONSE_TYPE_DEFERRED_UPDATE_MESSAGE };
}

function update(message: DiscordMessage): DiscordInteractionResponse {
  return { type: RESPONSE_TYPE_UPDATE_MESSAGE, data: message };
}
