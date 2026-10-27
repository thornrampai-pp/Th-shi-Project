import { env } from '../../config/env';
import { buildSlipPrompt, parseSlipBatch } from './slip-extraction';
import type { SlipExtraction } from './slip-extraction';

export type { SlipExtraction, SlipTransactionType } from './slip-extraction';

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
  ) {
    super(message);
    this.name = 'GeminiRequestError';
  }
}

/**
 * Reads several slip images in ONE Gemini request and returns one extraction per image,
 * in the same order. Used by every slip entry point (web upload, Discord /upload-slip,
 * uploadTransactionSlip) — one extraction implementation for all of them.
 */
export async function extractSlipsData(images: SlipImagePayload[]): Promise<SlipExtraction[]> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  if (images.length === 0) return [];

  // Each image is preceded by its label, so the model can keep them apart and in order.
  const imageParts = images.flatMap((image, i) => [
    { text: `Image ${i + 1}:` },
    { inline_data: { mime_type: image.mimeType, data: image.base64 } },
  ]);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      // Key goes in a header rather than the query string so it never ends up in URL logs.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildSlipPrompt(images.length) }, ...imageParts] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const retryable = response.status === 429 || response.status >= 500;
    throw new GeminiRequestError(`Gemini API responded with ${response.status}: ${body}`, retryable);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Gemini returned no readable content for these slip images');
  }

  return parseSlipBatch(text, images.length);
}
