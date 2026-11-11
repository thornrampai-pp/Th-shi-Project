import { describe, it, expect } from 'vitest';
import {
  DISCORD_CONTENT_LIMIT,
  alertTriggeredMessage,
  connectedMessage,
  orderFilledMessage,
  statementImportMessages,
  transactionLine,
  transactionMessage,
  type TransactionNotice,
} from './notification-messages';

const buy: TransactionNotice = {
  type: 'BUY',
  symbol: 'VOO',
  assetType: 'ETF',
  portfolioName: 'Fire',
  quantity: 0.0321705,
  price: 692.56,
  amount: 22.33,
  fee: 0.05,
  currency: 'USD',
  executedAt: new Date('2026-11-10T03:00:00Z'),
};

describe('transactionMessage — one recorded transaction', () => {
  it('says what was bought, where, how much and when', () => {
    expect(transactionMessage(buy).text).toBe(
      '🟢 **ซื้อ VOO** · พอร์ต Fire\n' +
        '0.0321705 หุ้น × $692.56 = **$22.33** (ค่าธรรมเนียม $0.05)\n' +
        '📅 10 พ.ย. 2569',
    );
  });

  it('counts fund units as หน่วย, and leaves out a zero fee', () => {
    const fund = { ...buy, symbol: 'K-USA-A(A)', assetType: 'MUTUAL_FUND', currency: 'THB', price: 12.3456, quantity: 81.0002, amount: 1000, fee: 0 };
    expect(transactionMessage(fund).text).toContain('81.0002 หน่วย × ฿12.3456 = **฿1,000.00**\n');
  });

  it('shows a sell in red with the net amount received', () => {
    const sell = { ...buy, type: 'SELL' as const, symbol: 'SMCI', portfolioName: 'Stock', quantity: 2.5, price: 42.1, amount: 105.2, fee: 0.05 };
    expect(transactionMessage(sell).text!.split('\n')[0]).toBe('🔴 **ขาย SMCI** · พอร์ต Stock');
  });

  it('describes cash movements and splits in words, not raw type codes', () => {
    const base = { ...buy, symbol: null, assetType: null, quantity: null, price: null, fee: 0 };
    expect(transactionMessage({ ...base, type: 'DEPOSIT', amount: 500, currency: 'THB' }).text!.split('\n')[0]).toBe(
      '💰 **ฝากเงิน ฿500.00** · พอร์ต Fire',
    );
    expect(transactionMessage({ ...buy, type: 'SPLIT', symbol: 'SMCI', ratio: 10 }).text!.split('\n')[0]).toBe(
      '✂️ **แตกพาร์ SMCI 10:1** · พอร์ต Fire',
    );
    expect(transactionMessage({ ...base, type: 'ADJUSTMENT', amount: -1.5, currency: 'USD' }).text!.split('\n')[0]).toBe(
      '🛠️ **ปรับยอดเงินสด -$1.50** · พอร์ต Fire',
    );
  });
});

describe('statementImportMessages — one summary per statement, every row listed', () => {
  it('lists every recorded row on its own line under one header', () => {
    const rows = [buy, { ...buy, symbol: 'QQQ', quantity: 0.0148, price: 600, amount: 8.88, fee: 0 }];
    const [msg, ...rest] = statementImportMessages({ broker: 'Dime', notices: rows, skipped: 1 });
    expect(rest).toHaveLength(0);
    const lines = msg!.text!.split('\n');
    expect(lines[0]).toBe('📄 **นำเข้า statement Dime** · บันทึก 2 รายการ · ข้าม 1 · พอร์ต Fire');
    expect(lines[1]).toBe('🟢 ซื้อ **VOO** 0.0321705 หุ้น × $692.56 = $22.33 · 10 พ.ย. 69');
    expect(lines[2]).toBe('🟢 ซื้อ **QQQ** 0.0148 หุ้น × $600.00 = $8.88 · 10 พ.ย. 69');
    expect(lines.at(-1)).toBe('รวมซื้อ $31.21');
  });

  it('names the portfolio on each row when the statement spans several', () => {
    const rows = [buy, { ...buy, symbol: 'AMD', portfolioName: 'Stock' }];
    const text = statementImportMessages({ broker: 'Dime', notices: rows, skipped: 0 })[0]!.text!;
    expect(text.split('\n')[0]).toBe('📄 **นำเข้า statement Dime** · บันทึก 2 รายการ · พอร์ต Fire, Stock');
    expect(text).toContain('🟢 ซื้อ **AMD** 0.0321705 หุ้น × $692.56 = $22.33 · Stock · 10 พ.ย. 69');
  });

  it('splits a long statement across messages under Discord\'s 2,000-character limit, losing no row', () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ ...buy, symbol: `SYM${i}` }));
    const messages = statementImportMessages({ broker: 'Dime', notices: rows, skipped: 0 });
    expect(messages.length).toBeGreaterThan(1);
    for (const m of messages) expect(m.text!.length).toBeLessThanOrEqual(DISCORD_CONTENT_LIMIT);
    const all = messages.map((m) => m.text).join('\n');
    for (let i = 0; i < 80; i++) expect(all).toContain(`**SYM${i}**`);
    expect(messages[1]!.text!.split('\n')[0]).toBe('📄 statement Dime (ต่อ 2/' + messages.length + ')');
  });

  it('sends nothing when no row was recorded', () => {
    expect(statementImportMessages({ broker: 'Dime', notices: [], skipped: 3 })).toEqual([]);
  });
});

describe('other notifications', () => {
  it('confirms a new channel in Thai, listing the events it will receive', () => {
    expect(connectedMessage('Finance hub', ['TRANSACTION_EXECUTED', 'SYSTEM_ALERT']).text).toBe(
      '✅ เชื่อมต่อ tōshi กับช่อง Finance hub แล้ว\nจะแจ้งเตือน: รายการซื้อขาย · แจ้งเตือนระบบ',
    );
  });

  it('reports an order fill in Thai like a transaction', () => {
    expect(orderFilledMessage(buy).text!.split('\n')[0]).toBe('✅ **คำสั่งซื้อ VOO สำเร็จ** · พอร์ต Fire');
  });

  it('formats a single statement line without bold header', () => {
    expect(transactionLine(buy, { withPortfolio: true })).toBe(
      '🟢 ซื้อ **VOO** 0.0321705 หุ้น × $692.56 = $22.33 · Fire · 10 พ.ย. 69',
    );
  });

  it('words a price alert in Thai with the value in its unit, and says it is now off', () => {
    const asset = { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', currency: 'USD' };
    expect(alertTriggeredMessage({ asset, condition: 'PRICE_ABOVE', target: 700, observed: 702.149 }).text).toBe(
      '🔔 **VOO ราคาสูงกว่า $700.00**\nตอนนี้ $702.15 · Vanguard S&P 500 ETF\nแจ้งเตือนนี้ปิดแล้ว — ตั้งใหม่ได้ในแอป',
    );
    expect(alertTriggeredMessage({ asset, condition: 'CHANGE_PCT_BELOW', target: -3, observed: -3.456 }).text!.split('\n')[0]).toBe(
      '🔔 **VOO % เปลี่ยนแปลงวันนี้ต่ำกว่า -3%**',
    );
  });
});
