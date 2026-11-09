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

/**
 * Without it a hung request would hold the upload open indefinitely. Multi-page PDFs
 * routinely take ~60s, so this leaves headroom before a timeout throws away a read
 * that was about to arrive (and spends another call on the retry).
 */
const GEMINI_TIMEOUT_MS = env.GEMINI_TIMEOUT_MS;

/**
 * `retryable` is false for 4xx other than 429 — a missing model, bad key or bad request
 * fails the same way every time, so retrying only delays the error. `timedOut` marks a
 * request that got no answer within GEMINI_TIMEOUT_MS: it has no HTTP status, but like
 * a 503 it says the model is stuck, not that the request is wrong.
 */
export class GeminiRequestError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status: number | null = null,
    public readonly timedOut: boolean = false,
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
 * 5xx), out of quota (429 — free-tier quota is per model) or hung (timed out). Another
 * model may well succeed, so these move on to the next fallback model instead of failing.
 */
export function shouldTryNextModel(err: unknown): boolean {
  if (!(err instanceof GeminiRequestError)) return false;
  if (err.timedOut) return true;
  return err.status !== null && (err.status === 429 || err.status >= 500);
}

/** GEMINI_MODEL first, then each GEMINI_FALLBACK_MODELS entry, without repeats. */
export function geminiModelChain(primary: string, fallbacks: string[]): string[] {
  return [...new Set([primary, ...fallbacks])];
}

/**
 * A model that just timed out / was overloaded / ran out of quota is tried LAST for a
 * while. Without this every new request (and every retry) starts again at the stuck
 * primary, paying a full timeout and a quota slot before reaching a model that works.
 * In-memory per process is enough: the server and a bulk-import script each learn it
 * within one request.
 */
const MODEL_COOLDOWN_MS = 10 * 60_000;
const cooldownUntil = new Map<string, number>();

/** Ready models first, then cooling ones — each group in its configured order. */
export function orderByAvailability(
  models: string[],
  now: number = Date.now(),
  until: ReadonlyMap<string, number> = cooldownUntil,
): string[] {
  const cooling = (m: string) => (until.get(m) ?? 0) > now;
  return [...models.filter((m) => !cooling(m)), ...models.filter(cooling)];
}

/** Test hook: forget every cooldown. */
export function resetModelCooldowns(): void {
  cooldownUntil.clear();
}

/**
 * One logical Gemini call: tries the models in order of availability, and on an
 * overload/quota/timeout error moves straight on to the next one. Any other error (bad
 * key, bad request, unreadable reply) is thrown at once — another model wouldn't fix
 * it. Cooling models are still tried last, so a call never fails unread just because
 * every model had a bad moment. Callers retry the whole chain with backoff.
 */
async function callGemini(kind: GeminiCallKind, promptText: string, parts: GeminiPart[]): Promise<string> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const models = orderByAvailability(geminiModelChain(env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODELS));
  let lastError: unknown;
  for (const [i, model] of models.entries()) {
    try {
      const text = await callGeminiModel(kind, model, promptText, parts);
      cooldownUntil.delete(model);
      return text;
    } catch (err) {
      lastError = err;
      if (!shouldTryNextModel(err)) throw err;
      cooldownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
      const next = models[i + 1];
      const reason = (err as GeminiRequestError).timedOut ? 'timed out' : (err as GeminiRequestError).status;
      if (next) console.warn(`⚠️ Gemini ${model} unavailable (${reason}) — trying ${next}`);
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
  let response: Response;
  try {
    response = await fetch(
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
  } catch (err) {
    // AbortSignal.timeout rejects with a DOMException named TimeoutError — no status,
    // but the model is stuck, so let the caller move on to the next one.
    if ((err as { name?: unknown } | null)?.name === 'TimeoutError') {
      throw new GeminiRequestError(`Gemini ${model} timed out after ${Math.round(GEMINI_TIMEOUT_MS / 1000)}s`, true, null, true);
    }
    throw err;
  }

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
