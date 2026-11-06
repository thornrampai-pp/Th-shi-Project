import { env } from '../../config/env';
import { buildSlipPrompt, parseSlipBatch } from './slip-extraction';
import type { SlipExtraction } from './slip-extraction';
import { buildStatementPrompt, parseStatementExtraction } from './statement-extraction';
import type { StatementExtraction } from './statement-extraction';
import { recordGeminiCall } from '../monitoring/usage-metrics';
import type { GeminiCallKind } from '../monitoring/usage-metrics';

export type { SlipExtraction, SlipTransactionType } from './slip-extraction';
export type { StatementExtraction, StatementRow, StatementTransactionType } from './statement-extraction';

export interface SlipImagePayload {
  base64: string;
  mimeType: string;
}

/** Without it a hung request would hold the upload open indefinitely. */
const GEMINI_TIMEOUT_MS = 90_000;

/**
 * `retryable` is false for 4xx other than 429 — a missing model, bad key or bad request
 * fails the same way every time, so retrying only delays the error.
 */
export class GeminiRequestError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'GeminiRequestError';
  }
}

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}

/** callGemini plus a usage record for the System page — success or failure. */
async function callGemini(kind: GeminiCallKind, promptText: string, parts: GeminiPart[]): Promise<string> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const startedAt = performance.now();
  let status: number | null = null;
  let usage: GeminiResponse['usageMetadata'];
  try {
    const result = await requestGemini(promptText, parts);
    status = result.status;
    usage = result.usage;
    if (!result.text) throw new Error('Gemini returned no readable content');
    recordGeminiUsage(kind, startedAt, status, usage, null);
    return result.text;
  } catch (err) {
    if (err instanceof GeminiRequestError) status = err.status;
    recordGeminiUsage(kind, startedAt, status, usage, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

function recordGeminiUsage(
  kind: GeminiCallKind,
  startedAt: number,
  status: number | null,
  usage: GeminiResponse['usageMetadata'],
  error: string | null,
): void {
  const promptTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  recordGeminiCall({
    kind,
    ok: error === null,
    status,
    ms: performance.now() - startedAt,
    promptTokens,
    outputTokens,
    totalTokens: usage?.totalTokenCount ?? promptTokens + outputTokens,
    error,
  });
}

async function requestGemini(
  promptText: string,
  parts: GeminiPart[],
): Promise<{ text: string | undefined; status: number; usage: GeminiResponse['usageMetadata'] }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      // Key goes in a header rather than the query string so it never ends up in URL logs.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }, ...parts] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const retryable = response.status === 429 || response.status >= 500;
    throw new GeminiRequestError(`Gemini API responded with ${response.status}: ${body}`, retryable, response.status);
  }

  const data = (await response.json()) as GeminiResponse;
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text, status: response.status, usage: data.usageMetadata };
}

/**
 * Reads several slip images in ONE Gemini request and returns one extraction per image,
 * in the same order. Used by every slip entry point (web upload, Discord /upload-slip,
 * uploadTransactionSlip) — one extraction implementation for all of them.
 */
export async function extractSlipsData(images: SlipImagePayload[]): Promise<SlipExtraction[]> {
  if (images.length === 0) return [];

  // Each image is preceded by its label, so the model can keep them apart and in order.
  const imageParts = images.flatMap((image, i) => [
    { text: `Image ${i + 1}:` },
    { inline_data: { mime_type: image.mimeType, data: image.base64 } },
  ]);

  const text = await callGemini('slip', buildSlipPrompt(images.length), imageParts);
  return parseSlipBatch(text, images.length);
}

/**
 * Reads ONE statement/confirmation-note document (PDF or image, possibly several
 * pages) and returns every trade row it lists.
 */
export async function extractStatementData(document: SlipImagePayload): Promise<StatementExtraction> {
  const text = await callGemini('statement', buildStatementPrompt(), [
    { inline_data: { mime_type: document.mimeType, data: document.base64 } },
  ]);
  return parseStatementExtraction(text);
}
