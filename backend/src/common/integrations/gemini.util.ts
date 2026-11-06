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

/**
 * Errors that are about the model rather than the request: overloaded (503 and other
 * 5xx) or out of quota (429 — free-tier quota is per model). Another model may well
 * succeed, so these move on to the next fallback model instead of failing.
 */
export function shouldTryNextModel(err: unknown): boolean {
  return err instanceof GeminiRequestError && err.status !== null && (err.status === 429 || err.status >= 500);
}

/** GEMINI_MODEL first, then each GEMINI_FALLBACK_MODELS entry, without repeats. */
export function geminiModelChain(primary: string, fallbacks: string[]): string[] {
  return [...new Set([primary, ...fallbacks])];
}

/**
 * One logical Gemini call: tries GEMINI_MODEL, and on an overload/quota error moves
 * straight on to the next fallback model. Any other error (bad key, bad request,
 * unreadable reply) is thrown at once — another model wouldn't fix it. Callers still
 * retry the whole chain with backoff if every model fails.
 */
async function callGemini(kind: GeminiCallKind, promptText: string, parts: GeminiPart[]): Promise<string> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const models = geminiModelChain(env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODELS);
  let lastError: unknown;
  for (const [i, model] of models.entries()) {
    try {
      return await callGeminiModel(kind, model, promptText, parts);
    } catch (err) {
      lastError = err;
      if (!shouldTryNextModel(err)) throw err;
      const next = models[i + 1];
      if (next) console.warn(`⚠️ Gemini ${model} unavailable (${(err as GeminiRequestError).status}) — trying ${next}`);
    }
  }
  throw lastError;
}

/** One request to one model, plus a usage record for the System page — success or failure. */
async function callGeminiModel(
  kind: GeminiCallKind,
  model: string,
  promptText: string,
  parts: GeminiPart[],
): Promise<string> {
  const startedAt = performance.now();
  let status: number | null = null;
  let usage: GeminiResponse['usageMetadata'];
  try {
    const result = await requestGemini(model, promptText, parts);
    status = result.status;
    usage = result.usage;
    if (!result.text) throw new Error('Gemini returned no readable content');
    recordGeminiUsage(kind, model, startedAt, status, usage, null);
    return result.text;
  } catch (err) {
    if (err instanceof GeminiRequestError) status = err.status;
    recordGeminiUsage(kind, model, startedAt, status, usage, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

function recordGeminiUsage(
  kind: GeminiCallKind,
  model: string,
  startedAt: number,
  status: number | null,
  usage: GeminiResponse['usageMetadata'],
  error: string | null,
): void {
  const promptTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  recordGeminiCall({
    kind,
    model,
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
  model: string,
  promptText: string,
  parts: GeminiPart[],
): Promise<{ text: string | undefined; status: number; usage: GeminiResponse['usageMetadata'] }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
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
