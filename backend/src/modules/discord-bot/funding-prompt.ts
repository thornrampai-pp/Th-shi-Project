// "Where does the money for this buy come from?" on Discord — for /upload-slip and
// /upload-statement. Cash is one shared pool per currency, so it's one choice for all.
import { money } from '../notification/notification-messages';
import { describeFundingQuestion } from '../transaction/funding-question';
import type { FundingQuestion } from '../transaction/funding-question';
import type { FundingMode } from '../transaction/funding';
import { actionRow, button } from './discord-api';
import type { DiscordComponent } from './discord-api';

/** Text + buttons. `customId(action)` builds this flow's id (slip / stmt). */
export function fundingPrompt(
  questions: FundingQuestion[],
  customId: (action: string) => string,
): { content: string; components: DiscordComponent[] } {
  const lines = questions.map((q) => `• ${describeFundingQuestion(q).replace(/ \(รวมเงินจากการขายในไฟล์นี้ [^)]*\)/, '')}`);
  const note = questions.some((q) => q.sellAmount > 0)
    ? '\n_(เงินสดกลางรวมเงินจากการขายในไฟล์นี้ ซึ่งจะบันทึกก่อนรายการซื้อ)_'
    : '';

  if (!questions.some((q) => q.kind === 'has_cash')) {
    return {
      content: `${lines.join('\n')}\nกดยืนยันเพื่อบันทึกเป็นการเติมเงิน${note}`,
      components: [actionRow(button(customId('fund_deposit'), '💰 ยืนยัน เติมเงิน', true))],
    };
  }

  const [only] = questions;
  const cashLabel =
    questions.length > 1
      ? '💵 ใช้เงินสดกลางก่อน แล้วเติมส่วนที่ขาด'
      : only!.shortfall <= 0
        ? '💵 ใช้เงินสดกลาง (ไม่ต้องเติม)'
        : `💵 ใช้เงินสดกลาง + เติม ${money(only!.shortfall, only!.currency)}`;
  return {
    content: `${lines.join('\n')}\nจะใช้เงินจากไหน?${note}`,
    components: [
      actionRow(button(customId('fund_cash'), cashLabel, true), button(customId('fund_deposit'), '💰 เติมเงินใหม่ทั้งหมด')),
    ],
  };
}

/** The button the user clicked → the funding mode, or null if it isn't a funding action. */
export function fundingChoiceFromAction(action: string | undefined): FundingMode | null {
  if (action === 'fund_cash') return 'CASH_FIRST';
  if (action === 'fund_deposit') return 'DEPOSIT_ALL';
  return null;
}
