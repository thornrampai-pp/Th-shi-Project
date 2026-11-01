// How slip results read in Discord — shared by the /upload-slip reply and the
// follow-up prompts (pick a transaction, pick a portfolio, fill in a trade).
import { prisma } from '../../config/prisma';
import type { SlipExtraction } from '../../common/integrations/gemini.util';
import type { SlipBatchItemResult, SlipTradeDraft } from '../transaction/slip.service';
import type { StatementImportSummary } from '../transaction/statement-import.service';

/** The transaction ids a result refers to, for loadTransactionSummaries(). */
export function transactionIdsOf(result: SlipBatchItemResult): string[] {
  if (result.status === 'matched' || result.status === 'created') return [result.slip.transactionId];
  if (result.status === 'ambiguous') return result.candidateIds;
  return [];
}

/** "BUY 10 AAPL · พอร์ต US Growth · 27 Oct 2026" per transaction id. */
export async function loadTransactionSummaries(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const transactions = await prisma.transaction.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      type: true,
      mainAssetId: true,
      mainQuantity: true,
      executedAt: true,
      externalRef: true,
      metadata: true,
      portfolio: { select: { name: true } },
    },
  });
  const assetIds = [...new Set(transactions.flatMap((t) => (t.mainAssetId ? [t.mainAssetId] : [])))];
  const assets = await prisma.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, symbol: true } });
  const symbolById = new Map(assets.map((a) => [a.id, a.symbol]));

  return new Map(
    transactions.map((t) => {
      const symbol = t.mainAssetId ? symbolById.get(t.mainAssetId) : undefined;
      const quantity = t.mainQuantity != null ? formatNumber(Number(t.mainQuantity)) : null;
      const what = [t.type, symbol && quantity ? `${quantity} ${symbol}` : symbol].filter(Boolean).join(' ');
      const timeKnown = (t.metadata as Record<string, unknown> | null)?.timeKnown === true;
      const when = t.executedAt.toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...(timeKnown ? { hour: '2-digit', minute: '2-digit' } : {}),
        timeZone: 'Asia/Bangkok',
      });
      const order = t.externalRef ? ` · Order ${t.externalRef}` : '';
      return [t.id, `${what} · พอร์ต "${t.portfolio.name}" · ${when}${order}`];
    }),
  );
}

/** The final status line for one slip. */
export function describeResult(result: SlipBatchItemResult, summaries: Map<string, string> = new Map()): string {
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
      return (
        `✅ ${describeSlip(result.extracted)}\n   → ${summarize(result.slip.transactionId)}` +
        result.differences.map((d) => `\n   ⚠️ ${d} — กรุณาตรวจสอบ`).join('')
      );
    case 'created':
      return `🆕 ${describeSlip(result.extracted)}\n   → บันทึกรายการใหม่: ${summarize(result.slip.transactionId)}`;
    case 'duplicate':
      return `❌ ${describeSlip(result.extracted)}\n   สลิปนี้เคยถูกใช้กับธุรกรรมอื่นแล้ว`;
    case 'ambiguous':
      return `⏸️ ${describeSlip(result.extracted)}\n   พบหลายรายการที่ตรงกัน — เลือกในข้อความด้านล่าง`;
    case 'needs_input':
      return result.need === 'portfolio'
        ? `⏸️ ${describeSlip(result.extracted)}\n   ไม่พบรายการที่ตรงกัน — เลือกพอร์ตในข้อความด้านล่าง`
        : `⏸️ ${describeSlip(result.extracted)}\n   ไม่พบรายการที่ตรงกัน — ตรวจ/กรอกข้อมูลในข้อความด้านล่าง`;
    case 'not_found':
      return (
        `❌ ${describeSlip(result.extracted)}\n   assetSymbol: ${result.extracted.assetSymbol ?? '-'}\n` +
        `   ⚠️ ไม่พบธุรกรรม สร้าง transaction ใหม่แล้ว upload อีกครั้ง`
      );
  }
}

export function describeSlip(extracted: SlipExtraction): string {
  const amount = extracted.amount != null ? formatMoney(extracted.amount) : '-';
  const order = extracted.orderRef ? `, Order: ${extracted.orderRef}` : '';
  return `ยอด ${amount} ${extracted.currency ?? 'THB'}, Ref: ${extracted.transRef ?? '-'}${order}`;
}

/** The follow-up message for /upload-statement — a summary, since a statement can have
 * far more rows than fit in one Discord message (the 2000-char limit). */
export function describeStatementResult(result: StatementImportSummary): string {
  const { rows } = result;
  const count = (status: StatementImportSummary['rows'][number]['status']) =>
    rows.filter((r) => r.status === status).length;

  const header = `📄 ${result.broker ?? 'Statement'} — ${rows.length} รายการ`;
  const summary =
    `🆕 บันทึกใหม่ ${count('created')} · ⏭️ ซ้ำ (ข้าม) ${count('duplicate')} · ` +
    `❓ อ่านไม่ได้ ${count('unreadable')} · ❌ error ${count('error')}`;

  const MAX_LISTED = 15;
  const problems = rows.filter((r) => r.status === 'unreadable' || r.status === 'error');
  const lines = problems.slice(0, MAX_LISTED).map((r) => {
    const label = [r.row.orderId ? `Order ${r.row.orderId}` : null, r.row.symbol].filter(Boolean).join(' ');
    return `${r.status === 'error' ? '❌' : '❓'} ${label || '(ไม่ทราบรายการ)'} — ${r.message ?? ''}`;
  });
  const more = problems.length > MAX_LISTED ? `\n...และอีก ${problems.length - MAX_LISTED} รายการที่มีปัญหา` : '';

  return [header, summary, ...lines].join('\n') + more;
}

export function describeDraft(draft: SlipTradeDraft): string {
  const show = (value: string | number | null) => (value == null ? '❔' : String(value));
  return [
    `ประเภท: ${show(draft.type)}`,
    `หุ้น: ${show(draft.symbol)}`,
    `จำนวน: ${show(draft.quantity != null ? formatNumber(draft.quantity) : null)}`,
    `ราคาต่อหน่วย: ${show(draft.price)}`,
    `ค่าธรรมเนียม: ${draft.fee != null ? draft.fee : '0'}`,
  ].join(' · ');
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
