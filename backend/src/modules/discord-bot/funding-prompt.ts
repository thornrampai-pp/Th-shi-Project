// "Where does the money for this buy come from?" on Discord — for /upload-slip (one
// question) and /upload-statement (one per portfolio that buys, answered together).
import { money } from '../notification/notification-messages';
import { describeFundingQuestion } from '../transaction/funding-question';
import type { FundingQuestion } from '../transaction/funding-question';
import type { FundingMode } from '../transaction/funding';
import { SELECT_MAX_OPTIONS, actionRow, button, stringSelect } from './discord-api';
import type { DiscordComponent } from './discord-api';

export interface FundingChoice {
  mode: FundingMode;
  fromPortfolioId?: string;
}

/** Text + buttons. `customId(action)` builds this flow's id (slip / stmt). */
export function fundingPrompt(
  questions: FundingQuestion[],
  customId: (action: string) => string,
): { content: string; components: DiscordComponent[] } {
  const lines = questions.map((q) => `• ${describeFundingQuestion(q).replace(/ \(รวมเงินจากการขายในไฟล์นี้ [^)]*\)/, '')}`);
  const fromSales = questions.filter((q) => q.sellAmount > 0);
  const note = fromSales.length ? '\n_(เงินสดรวมเงินจากการขายในไฟล์นี้ ซึ่งจะบันทึกก่อนรายการซื้อ)_' : '';
  const anyCash = questions.some((q) => q.kind === 'has_cash');

  if (!anyCash) {
    return {
      content: `${lines.join('\n')}\nกดยืนยันเพื่อบันทึกเป็นการเติมเงินเข้าพอร์ต${note}`,
      components: [actionRow(button(customId('fund_deposit'), '💰 ยืนยัน เติมเงิน', true)), ...borrowRow(questions, customId)],
    };
  }

  const shortfall = questions.reduce((s, q) => s + q.shortfall, 0);
  const currency = questions[0]!.currency;
  const sameCurrency = questions.every((q) => q.currency === currency);
  const cashLabel =
    shortfall <= 0
      ? '💵 ใช้เงินสด (ไม่ต้องเติม)'
      : sameCurrency
        ? `💵 ใช้เงินสดก่อน + เติม ${money(shortfall, currency)}`
        : '💵 ใช้เงินสดก่อน แล้วเติมส่วนที่ขาด';
  return {
    content: `${lines.join('\n')}\nจะใช้เงินจากไหน?${note}`,
    components: [
      actionRow(button(customId('fund_cash'), cashLabel, true), button(customId('fund_deposit'), '💰 เติมเงินใหม่ทั้งหมด')),
      ...borrowRow(questions, customId),
    ],
  };
}

/** Borrowing is offered only for a single question (a slip, or a one-portfolio statement). */
function borrowRow(questions: FundingQuestion[], customId: (action: string) => string): DiscordComponent[] {
  const [only] = questions;
  if (questions.length !== 1 || !only || only.shortfall <= 0 || only.others.length === 0) return [];
  return [
    actionRow(
      stringSelect(
        customId('fund_from'),
        'หรือใช้เงินสดจากพอร์ตอื่น',
        only.others.slice(0, SELECT_MAX_OPTIONS).map((o) => ({
          label: `${o.portfolioName} · มี ${money(o.balance, only.currency)}`,
          value: o.portfolioId,
        })),
      ),
    ),
  ];
}

/** The button / select the user clicked → the choice, or null if it isn't a funding action. */
export function fundingChoiceFromAction(action: string | undefined, values: string[]): FundingChoice | null {
  if (action === 'fund_cash') return { mode: 'CASH_FIRST' };
  if (action === 'fund_deposit') return { mode: 'DEPOSIT_ALL' };
  if (action === 'fund_from') return values[0] ? { mode: 'CASH_FIRST', fromPortfolioId: values[0] } : null;
  return null;
}
