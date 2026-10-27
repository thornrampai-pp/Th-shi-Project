// The Gemini slip-reading contract — prompt and response parsing — kept free of env and
// network so it can be unit-tested. gemini.util.ts does the actual HTTP call.

export type SlipTransactionType = 'BUY' | 'SELL' | 'EXCHANGE';

export interface SlipExtraction {
  amount: number | null;
  currency: string | null;
  transactionDate: string | null; // ISO 8601
  transRef: string | null;
  sendingBank: string | null;
  receivingBank: string | null;
  senderName: string | null;
  fee: number | null;
  vat: number | null;
  netAmount: number | null;
  fxRate: number | null;
  targetAmount: number | null;
  targetCurrency: string | null;
  assetSymbol: string | null; // e.g. "LLY", "USD" — what was bought/sold/exchanged into
  transactionType: SlipTransactionType | null;
  confidence: 'high' | 'medium' | 'low';
}

const FIELDS = `{
  "amount": number or null,
  "currency": string (3-letter ISO code, e.g. "THB", "USD") or null,
  "transactionDate": string (ISO 8601, include the time and the +07:00 offset for Thai slips) or null,
  "transRef": string or null,
  "sendingBank": string or null,
  "receivingBank": string or null,
  "senderName": string or null,
  "fee": number or null,
  "vat": number or null,
  "netAmount": number (amount after fee and VAT) or null,
  "fxRate": number (exchange rate shown on the slip) or null,
  "targetAmount": number (amount received after currency conversion) or null,
  "targetCurrency": string (3-letter ISO code of the converted amount) or null,
  "assetSymbol": string (ticker or fund code bought/sold, e.g. "LLY", or the currency bought for an exchange, e.g. "USD") or null,
  "transactionType": "BUY" | "SELL" | "EXCHANGE" or null,
  "confidence": "high" | "medium" | "low"
}`;

/**
 * One prompt for any number of images, so a batch is a single request: the prompt
 * text is paid for once instead of per slip, and it's one call against the quota.
 */
export function buildSlipPrompt(imageCount: number): string {
  return `You are reading ${imageCount} bank transfer / brokerage / currency exchange slip image(s) (Thai or international), labelled "Image 1" to "Image ${imageCount}" in the order given.

Return STRICT JSON only — no markdown formatting, no code fences, no extra text: a JSON array of exactly ${imageCount} object(s), one per image, in the same order as the images. Each object has these fields:
${FIELDS}

"amount" is the main amount paid/transferred as printed on the slip, in "currency".
Read every image on its own — never copy a value from one slip into another's object. If an image is not a slip, still return an object for it with every field null and "confidence": "low".
If a field is not visible or not legible, use null for that field. Never guess a number you cannot actually read — a null is always better than a wrong guess here, since this feeds a financial record.`;
}

/**
 * Parses Gemini's reply for a batch of `expected` images. Throws (so the caller
 * retries) when it isn't JSON or the count doesn't line up — results are matched to
 * images by position, so a missing or extra entry would shift every slip after it.
 */
export function parseSlipBatch(text: string, expected: number): SlipExtraction[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini response was not valid JSON');
  }

  // A single image sometimes comes back as a bare object instead of a 1-item array.
  const items = Array.isArray(parsed) ? parsed : expected === 1 && parsed && typeof parsed === 'object' ? [parsed] : null;
  if (!items) throw new Error('Gemini response was not a JSON array');
  if (items.length !== expected) {
    throw new Error(`Gemini returned ${items.length} result(s) for ${expected} image(s)`);
  }
  return items.map(normalizeSlipExtraction);
}

export function normalizeSlipExtraction(raw: unknown): SlipExtraction {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const confidence =
    obj.confidence === 'high' || obj.confidence === 'medium' || obj.confidence === 'low' ? obj.confidence : 'low';
  const transactionType =
    obj.transactionType === 'BUY' || obj.transactionType === 'SELL' || obj.transactionType === 'EXCHANGE'
      ? obj.transactionType
      : null;

  return {
    amount: numberOrNull(obj.amount),
    currency: codeOrNull(obj.currency),
    transactionDate: typeof obj.transactionDate === 'string' ? obj.transactionDate : null,
    transRef: typeof obj.transRef === 'string' && obj.transRef.trim() ? obj.transRef.trim() : null,
    sendingBank: typeof obj.sendingBank === 'string' ? obj.sendingBank : null,
    receivingBank: typeof obj.receivingBank === 'string' ? obj.receivingBank : null,
    senderName: typeof obj.senderName === 'string' ? obj.senderName : null,
    fee: numberOrNull(obj.fee),
    vat: numberOrNull(obj.vat),
    netAmount: numberOrNull(obj.netAmount),
    fxRate: numberOrNull(obj.fxRate),
    targetAmount: numberOrNull(obj.targetAmount),
    targetCurrency: codeOrNull(obj.targetCurrency),
    assetSymbol: codeOrNull(obj.assetSymbol),
    transactionType,
    confidence,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function codeOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}
