import type { DiscordMessage } from '../../common/integrations/discord.util';

/**
 * Wording of every Discord notification, kept in one place and free of I/O so it can
 * be tested. Thai, plain text with Discord markdown; amounts in the asset's currency.
 */

/** Discord rejects message content longer than this. */
export const DISCORD_CONTENT_LIMIT = 2000;

export type NoticeTransactionType =
  | 'BUY'
  | 'SELL'
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'DIVIDEND'
  | 'FEE'
  | 'TAX'
  | 'SPLIT'
  | 'REPATRIATION'
  | 'ADJUSTMENT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT';

export interface TransactionNotice {
  type: NoticeTransactionType;
  symbol: string | null;
  /** AssetType — MUTUAL_FUND counts หน่วย, everything else หุ้น. */
  assetType: string | null;
  portfolioName: string;
  quantity: number | null;
  price: number | null;
  /** Total in `currency`: cost incl. fee for a buy, net received for a sell, the cash moved otherwise. */
  amount: number | null;
  fee?: number | null;
  currency: string;
  executedAt: Date;
  ratio?: number | null;
  /** REPATRIATION: what arrived at home. */
  toAmount?: number | null;
  toCurrency?: string | null;
}

const EVENT_LABEL: Record<string, string> = {
  TRANSACTION_EXECUTED: 'รายการซื้อขาย',
  ALERT_TRIGGERED: 'แจ้งเตือนราคา',
  DAILY_SUMMARY: 'สรุปรายวัน',
  BACKTEST_COMPLETED: 'ผล backtest',
  ORDER_FILLED: 'คำสั่งซื้อขายสำเร็จ',
  SYSTEM_ALERT: 'แจ้งเตือนระบบ',
};

const SYMBOLS: Record<string, string> = { USD: '$', THB: '฿', EUR: '€', GBP: '£', JPY: '¥' };

const longDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
const shortDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });

function number(value: number, minDigits: number, maxDigits: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits });
}

/** `$1,234.56`, `฿-1.50` → `-฿1.50`; unknown currencies as `1,234.56 SGD`. */
export function money(value: number, currency: string, maxDigits = 2): string {
  const digits = number(Math.abs(value), 2, maxDigits);
  const sign = value < 0 ? '-' : '';
  const symbol = SYMBOLS[currency];
  return symbol ? `${sign}${symbol}${digits}` : `${sign}${digits} ${currency}`;
}

const quantity = (q: number) => number(q, 0, 8);
const unit = (n: TransactionNotice) => (n.assetType === 'MUTUAL_FUND' ? 'หน่วย' : 'หุ้น');

/** `0.0321705 หุ้น × $692.56 = $22.33` (the total bold in a single-transaction message). */
function trade(n: TransactionNotice, boldTotal: boolean): string {
  const total = n.amount != null ? money(n.amount, n.currency) : '—';
  return `${quantity(n.quantity ?? 0)} ${unit(n)} × ${money(n.price ?? 0, n.currency, 4)} = ${boldTotal ? `**${total}**` : total}`;
}

const cash = (n: TransactionNotice) => money(n.amount ?? 0, n.currency);

/** Icon + Thai verb + subject, e.g. `🟢 ซื้อ VOO`, `💰 ฝากเงิน ฿500.00`. */
function headline(n: TransactionNotice): string {
  switch (n.type) {
    case 'BUY':
      return `🟢 ซื้อ ${n.symbol}`;
    case 'SELL':
      return `🔴 ขาย ${n.symbol}`;
    case 'DEPOSIT':
      return `💰 ฝากเงิน ${cash(n)}`;
    case 'WITHDRAW':
      return `💸 ถอนเงิน ${cash(n)}`;
    case 'DIVIDEND':
      return `💵 ปันผล${n.symbol ? ` ${n.symbol}` : ''} ${cash(n)}`;
    case 'FEE':
      return `🧾 ค่าธรรมเนียม ${cash(n)}`;
    case 'TAX':
      return `🏛️ ภาษี ${cash(n)}`;
    case 'SPLIT':
      return `✂️ แตกพาร์ ${n.symbol} ${n.ratio ?? n.quantity}:1`;
    case 'REPATRIATION':
      return `🏠 นำเงินกลับประเทศ ${cash(n)}${n.toAmount != null && n.toCurrency ? ` → ${money(n.toAmount, n.toCurrency)}` : ''}`;
    case 'ADJUSTMENT':
      return `🛠️ ปรับยอดเงินสด ${cash(n)}`;
    case 'TRANSFER_IN':
      return `📥 รับโอน ${n.symbol}`;
    case 'TRANSFER_OUT':
      return `📤 โอนออก ${n.symbol}`;
  }
}

const isTrade = (n: TransactionNotice) => (n.type === 'BUY' || n.type === 'SELL') && n.quantity != null && n.price != null;

/** One recorded transaction (typed in, a slip, the web): headline, the numbers, the date. */
export function transactionMessage(n: TransactionNotice): DiscordMessage {
  const [icon, ...words] = headline(n).split(' ');
  const lines = [`${icon} **${words.join(' ')}** · พอร์ต ${n.portfolioName}`];
  if (isTrade(n)) {
    const fee = n.fee ? ` (ค่าธรรมเนียม ${money(n.fee, n.currency)})` : '';
    lines.push(trade(n, true) + fee);
  } else if ((n.type === 'TRANSFER_IN' || n.type === 'TRANSFER_OUT') && n.quantity != null) {
    lines.push(`${quantity(n.quantity)} ${unit(n)}`);
  }
  lines.push(`📅 ${longDate.format(n.executedAt)}`);
  return { text: lines.join('\n') };
}

/** An order from the trading module filled — the same facts, framed as the order. */
export function orderFilledMessage(n: TransactionNotice): DiscordMessage {
  const side = n.type === 'SELL' ? 'ขาย' : 'ซื้อ';
  const [, ...rest] = transactionMessage(n).text!.split('\n');
  return { text: [`✅ **คำสั่ง${side} ${n.symbol} สำเร็จ** · พอร์ต ${n.portfolioName}`, ...rest].join('\n') };
}

/** One row of a statement summary: `🟢 ซื้อ **VOO** 0.03 หุ้น × $692.56 = $22.33 · Fire · 10 พ.ย. 69`. */
export function transactionLine(n: TransactionNotice, opts: { withPortfolio: boolean }): string {
  const head = headline(n);
  const subject = n.symbol && head.endsWith(` ${n.symbol}`)
    ? `${head.slice(0, -n.symbol.length)}**${n.symbol}**`
    : head;
  const parts = [isTrade(n) ? `${subject} ${trade(n, false)}` : subject];
  if (opts.withPortfolio) parts.push(n.portfolioName);
  parts.push(shortDate.format(n.executedAt));
  return parts.join(' · ');
}

/**
 * A statement import as ONE notification listing every recorded row — instead of one
 * message per row, which flooded the channel and hit Discord's rate limit. Split into
 * several messages only when it would pass Discord's 2,000-character limit.
 */
export function statementImportMessages(params: {
  broker: string | null;
  notices: TransactionNotice[];
  /** Rows not recorded (duplicates, unreadable, errors). */
  skipped: number;
}): DiscordMessage[] {
  const { notices, skipped } = params;
  if (notices.length === 0) return [];
  const broker = params.broker?.trim() || '';
  const portfolios = [...new Set(notices.map((n) => n.portfolioName))];
  const withPortfolio = portfolios.length > 1;

  const header = [
    `📄 **นำเข้า statement${broker ? ` ${broker}` : ''}**`,
    `บันทึก ${notices.length} รายการ`,
    ...(skipped > 0 ? [`ข้าม ${skipped}`] : []),
    `พอร์ต ${portfolios.join(', ')}`,
  ].join(' · ');

  const totals = new Map<string, number>(); // "ซื้อ|USD" → sum
  for (const n of notices) {
    if (!isTrade(n) || n.amount == null) continue;
    const key = `${n.type === 'BUY' ? 'ซื้อ' : 'ขาย'}|${n.currency}`;
    totals.set(key, (totals.get(key) ?? 0) + n.amount);
  }
  const footer = totals.size
    ? [...totals].map(([key, sum]) => {
        const [verb, currency] = key.split('|') as [string, string];
        return `รวม${verb} ${money(sum, currency)}`;
      }).join(' · ')
    : null;

  const rows = notices.map((n) => transactionLine(n, { withPortfolio }));
  const lines = footer ? [...rows, footer] : rows;

  // Pack lines into chunks under the limit; continuation chunks get a short header
  // (filled in once the chunk count is known).
  const CONTINUATION = '📄 statement (ต่อ 00/00)'.length + broker.length + 1;
  const chunks: string[][] = [[header]];
  let size = header.length;
  for (const line of lines) {
    if (size + 1 + line.length > DISCORD_CONTENT_LIMIT) {
      chunks.push([]);
      size = CONTINUATION;
    }
    chunks.at(-1)!.push(line);
    size += 1 + line.length;
  }
  return chunks.map((chunk, i) => ({
    text: (i === 0 ? chunk : [`📄 statement${broker ? ` ${broker}` : ''} (ต่อ ${i + 1}/${chunks.length})`, ...chunk]).join('\n'),
  }));
}

/** Sent once when a webhook is connected; doubles as the delivery check. */
export function connectedMessage(label: string | null | undefined, events: string[]): DiscordMessage {
  const names = events.map((e) => EVENT_LABEL[e] ?? e);
  return {
    text: `✅ เชื่อมต่อ tōshi กับช่อง ${label?.trim() || 'Discord'} แล้ว` + (names.length ? `\nจะแจ้งเตือน: ${names.join(' · ')}` : ''),
  };
}

/** The "Test" button in Settings. */
export function testMessage(label: string | null | undefined): DiscordMessage {
  return { text: `🔔 ข้อความทดสอบจาก tōshi — ช่อง ${label?.trim() || 'Discord'} รับแจ้งเตือนได้ปกติ` };
}

export const ALERT_CONDITION_LABEL: Record<string, string> = {
  PRICE_ABOVE: 'ราคาสูงกว่า',
  PRICE_BELOW: 'ราคาต่ำกว่า',
  CHANGE_PCT_ABOVE: '% เปลี่ยนแปลงวันนี้สูงกว่า',
  CHANGE_PCT_BELOW: '% เปลี่ยนแปลงวันนี้ต่ำกว่า',
  PE_ABOVE: 'P/E สูงกว่า',
  PE_BELOW: 'P/E ต่ำกว่า',
  DIVIDEND_YIELD_ABOVE: 'Dividend Yield สูงกว่า',
};

/** A value in the condition's own unit: a price in the asset's currency, a % or a plain ratio. */
function alertValue(condition: string, value: number, currency: string): string {
  if (condition.startsWith('PRICE_')) return money(value, currency);
  if (condition.startsWith('CHANGE_PCT_') || condition.startsWith('DIVIDEND_YIELD_')) return `${number(value, 0, 2)}%`;
  return number(value, 0, 2);
}

/** A price alert fired (and was switched off — alerts are one-shot). */
export function alertTriggeredMessage(params: {
  asset: { symbol: string; name: string; currency: string };
  condition: string;
  target: number;
  observed: number;
}): DiscordMessage {
  const { asset, condition, target, observed } = params;
  const label = ALERT_CONDITION_LABEL[condition] ?? condition;
  return {
    text: [
      `🔔 **${asset.symbol} ${label} ${alertValue(condition, target, asset.currency)}**`,
      `ตอนนี้ ${alertValue(condition, observed, asset.currency)} · ${asset.name}`,
      'แจ้งเตือนนี้ปิดแล้ว — ตั้งใหม่ได้ในแอป',
    ].join('\n'),
  };
}
