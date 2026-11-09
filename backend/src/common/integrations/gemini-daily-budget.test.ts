import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Per-model daily counts, as the usage metrics would report them for today (PT).
const counts: Record<string, number> = {};

vi.mock('../../config/env', () => ({
  env: {
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'primary',
    GEMINI_FALLBACK_MODELS: ['fallback'],
    GEMINI_TIMEOUT_MS: 180_000,
    GEMINI_RPD_LIMIT: 15,
  },
}));
vi.mock('../monitoring/usage-metrics', () => ({
  recordGeminiCall: vi.fn(),
  geminiCallsTodayByModel: vi.fn(async () => ({ ...counts })),
}));

import {
  GeminiRequestError,
  dailyCallsLeft,
  extractStatementData,
  resetModelCooldowns,
  splitByDailyBudget,
} from './gemini.util';

const OK_BODY = JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify({ broker: 'Dime', rows: [] }) }] } }],
});
const doc = { base64: 'JVBERi0=', mimeType: 'application/pdf' };

function stubFetch() {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(decodeURIComponent(String(url).split('/models/')[1]!.split(':')[0]!));
      return new Response(OK_BODY, { status: 200 });
    }),
  );
  return calls;
}

describe('splitByDailyBudget', () => {
  it('keeps every model when no daily limit is configured', () => {
    expect(splitByDailyBudget(['a', 'b'], { a: 99 }, null)).toEqual({ available: ['a', 'b'], exhausted: [] });
  });

  it('drops models that reached the limit, keeping the order of the rest', () => {
    expect(splitByDailyBudget(['a', 'b', 'c'], { a: 15, b: 3, c: 16 }, 15)).toEqual({
      available: ['b'],
      exhausted: ['a', 'c'],
    });
  });

  it('treats a model with no calls today as fully available', () => {
    expect(splitByDailyBudget(['a'], {}, 15)).toEqual({ available: ['a'], exhausted: [] });
  });
});

describe('dailyCallsLeft', () => {
  it('sums what each model in the chain has left, minus a per-model reserve', () => {
    expect(dailyCallsLeft(['a', 'b'], { a: 10, b: 2 }, 15, 1)).toBe(4 + 12);
  });

  it('never counts a model below zero', () => {
    expect(dailyCallsLeft(['a', 'b'], { a: 15, b: 14 }, 15, 1)).toBe(0);
  });

  it('is unlimited without a configured limit', () => {
    expect(dailyCallsLeft(['a'], { a: 1000 }, null, 1)).toBe(Infinity);
  });
});

describe('the daily limit is enforced per model', () => {
  beforeEach(() => {
    resetModelCooldowns();
    for (const k of Object.keys(counts)) delete counts[k];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('skips a model that used up its day and goes straight to the next one', async () => {
    counts.primary = 15;
    const calls = stubFetch();
    await expect(extractStatementData(doc)).resolves.toEqual({ broker: 'Dime', rows: [] });
    expect(calls).toEqual(['fallback']);
  });

  it('refuses without calling anything once every model is used up', async () => {
    counts.primary = 15;
    counts.fallback = 15;
    const calls = stubFetch();
    const err = await extractStatementData(doc).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeminiRequestError);
    expect((err as GeminiRequestError).status).toBe(429);
    expect((err as GeminiRequestError).retryable).toBe(false); // retrying today won't help
    expect((err as Error).message).toMatch(/daily limit/i);
    expect(calls).toEqual([]);
  });
});
