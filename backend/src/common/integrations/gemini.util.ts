import { env } from '../../config/env';

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

const EXTRACTION_PROMPT = `You are reading a bank transfer / brokerage / currency exchange slip image (Thai or international). Extract the following fields as STRICT JSON only — no markdown formatting, no code fences, no extra text before or after:
{
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
}
"amount" is the main amount paid/transferred as printed on the slip, in "currency".
If a field is not visible or not legible, use null for that field. Never guess a number you cannot actually read — a null is always better than a wrong guess here, since this feeds a financial record.`;

/**
 * Sends a slip image to Gemini and returns structured fields. Used by BOTH the
 * frontend/API upload path (slip.service.ts) and the Discord /upload-slip command —
 * one extraction implementation, two entry points.
 */
export async function extractSlipData(imageBase64: string, mimeType = 'image/jpeg'): Promise<SlipExtraction> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      // Key goes in a header rather than the query string so it never ends up in URL logs.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: EXTRACTION_PROMPT }, { inline_data: { mime_type: mimeType, data: imageBase64 } }],
          },
        ],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini API responded with ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Gemini returned no readable content for this slip image');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini response was not valid JSON');
  }

  return normalizeSlipExtraction(parsed);
}

function normalizeSlipExtraction(raw: unknown): SlipExtraction {
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
