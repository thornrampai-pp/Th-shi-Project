// The Gemini statement-reading contract — prompt and response parsing — kept free of
// env and network so it can be unit-tested. gemini.util.ts does the actual HTTP call.
//
// Unlike a single slip (one image = one transaction), a statement/confirmation note is
// ONE document (usually a PDF, possibly several pages) listing MANY trades — a broker's
// daily/monthly confirmation note, for example. One Gemini call returns one row per trade.

export type StatementTransactionType = 'BUY' | 'SELL';

export interface StatementRow {
  /** The broker's own unique order / trade / confirmation number for THIS row — used to
   * stop the same statement being imported twice. Never guessed; null if not printed. */
  orderId: string | null;
  /** ISO 8601 — the trade/settlement date printed for this row. */
  date: string | null;
  transactionType: StatementTransactionType | null;
  /** Ticker as printed, e.g. "XLY", "PTT". Exchange suffix added at import time if needed. */
  symbol: string | null;
  quantity: number | null;
  /** Per unit, in `currency` — the trade's OWN currency, not any converted/home-currency column. */
  price: number | null;
  currency: string | null;
  /** In `currency` (same as price) — a fee printed only in a converted/home currency is ignored. */
  fee: number | null;
  /** Total consideration for this row, in `currency` — for display/cross-check only. */
  totalAmount: number | null;
}

export interface StatementExtraction {
  broker: string | null;
  rows: StatementRow[];
}

const ROW_FIELDS = `{
  "orderId": string (this row's own unique order/trade/confirmation number, e.g. "เลขที่คำสั่ง", "Order ID") or null,
  "date": string (ISO 8601 date, the trade or settlement date for this row) or null,
  "transactionType": "BUY" | "SELL" or null,
  "symbol": string (ticker as printed, e.g. "XLY", "PTT" — without any exchange suffix) or null,
  "quantity": number (units/shares for this row) or null,
  "price": number (price per unit, in this row's OWN trading currency — not a converted column) or null,
  "currency": string (3-letter ISO code of the row's own trading currency, e.g. "USD") or null,
  "fee": number (this row's fee, in the SAME currency as "price" — never a fee printed only in a converted/home currency) or null,
  "totalAmount": number (this row's total amount, in the SAME currency as "price") or null
}`;

export function buildStatementPrompt(): string {
  return `You are reading a brokerage or bank trade confirmation note / statement document (it may have several pages). It lists multiple trades (BUY/SELL), one per row of a table.

Return STRICT JSON only — no markdown formatting, no code fences, no extra text: a single JSON object:
{
  "broker": string (the issuing company's name, if printed) or null,
  "rows": [ ${ROW_FIELDS}, ... one object per trade row, in the order printed ]
}

Rules:
- Extract EVERY trade row on every page — do not skip or summarize rows, and do not merge rows.
- Statements often show two currency columns per amount (the trade's own currency, and a converted total in the client's home currency, e.g. THB). ALWAYS use the trade's OWN currency column for "price", "fee" and "totalAmount" — never the converted/home-currency one, even if it's zero and the other is blank.
- "orderId" must be this row's own reference, not a statement-wide or account number. If a row has no distinguishable order/trade number, leave it null rather than reusing another row's.
- Never guess a number you cannot actually read — null is always better than a wrong guess here, since this feeds a financial record.
- Brokers print trade types as codes; map them to BUY or SELL: BUY, SUB (subscription / buy fund units) and SWI (switch in) are "BUY"; SEL, SELL, RED (redemption / sell fund units) and SWO (switch out) are "SELL". Anything else (e.g. rewards, option exercises) is not a BUY/SELL trade — leave "transactionType" null for that row.
- A row that fails these rules (e.g. a subtotal/header row, not an actual trade) should simply be left out of "rows", not included with nulls.`;
}

/**
 * Parses Gemini's reply for a statement document. Throws (so the caller retries) when
 * it isn't the expected JSON shape.
 */
export function parseStatementExtraction(text: string): StatementExtraction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini response was not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || !('rows' in parsed)) {
    throw new Error('Gemini response was not the expected statement shape');
  }
  const obj = parsed as Record<string, unknown>;
  const rawRows = Array.isArray(obj.rows) ? obj.rows : [];
  return {
    broker: typeof obj.broker === 'string' && obj.broker.trim() ? obj.broker.trim() : null,
    rows: rawRows.map(normalizeStatementRow),
  };
}

function normalizeStatementRow(raw: unknown): StatementRow {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const transactionType = obj.transactionType === 'BUY' || obj.transactionType === 'SELL' ? obj.transactionType : null;
  return {
    orderId: refOrNull(obj.orderId),
    date: typeof obj.date === 'string' ? obj.date : null,
    transactionType,
    symbol: codeOrNull(obj.symbol),
    quantity: positiveOrNull(obj.quantity),
    price: positiveOrNull(obj.price),
    currency: codeOrNull(obj.currency),
    fee: numberOrNull(obj.fee),
    totalAmount: numberOrNull(obj.totalAmount),
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveOrNull(value: unknown): number | null {
  const n = numberOrNull(value);
  return n != null && n > 0 ? n : null;
}

function refOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function codeOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}
