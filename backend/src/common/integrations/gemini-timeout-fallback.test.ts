import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Keep the unit test off the network-facing config and the Redis-backed metrics.
vi.mock('../../config/env', () => ({
  env: {
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'primary',
    GEMINI_FALLBACK_MODELS: ['fallback-1', 'fallback-2'],
    GEMINI_TIMEOUT_MS: 180_000,
  },
}));
vi.mock('../monitoring/usage-metrics', () => ({ recordGeminiCall: vi.fn() }));

import {
  GeminiRequestError,
  extractStatementData,
  orderByAvailability,
  resetModelCooldowns,
  shouldTryNextModel,
} from './gemini.util';

const OK_BODY = JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify({ broker: 'Dime', rows: [] }) }] } }],
});

function timeoutError(): Error {
  const err = new Error('The operation was aborted due to timeout');
  err.name = 'TimeoutError';
  return err;
}

/** fetch stub: `script[model]` decides what each model does, in call order. */
function stubFetch(script: Record<string, 'timeout' | 503 | 'ok'>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    const model = decodeURIComponent(String(url).split('/models/')[1]!.split(':')[0]!);
    calls.push(model);
    const behaviour = script[model];
    if (behaviour === 'timeout') throw timeoutError();
    if (behaviour === 503) return new Response('{"error":"overloaded"}', { status: 503 });
    return new Response(OK_BODY, { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const doc = { base64: 'JVBERi0=', mimeType: 'application/pdf' };

describe('timeouts move on to the next model', () => {
  beforeEach(() => resetModelCooldowns());
  afterEach(() => vi.unstubAllGlobals());

  it('treats a timed-out request as the model being unavailable', () => {
    expect(shouldTryNextModel(new GeminiRequestError('timed out', true, null, true))).toBe(true);
    // A status-less error that is NOT a timeout (e.g. a dropped connection) still stops.
    expect(shouldTryNextModel(new GeminiRequestError('no status', true))).toBe(false);
  });

  it('falls through to the next model after a timeout instead of failing the attempt', async () => {
    const calls = stubFetch({ primary: 'timeout', 'fallback-1': 'ok' });
    await expect(extractStatementData(doc)).resolves.toEqual({ broker: 'Dime', rows: [] });
    expect(calls).toEqual(['primary', 'fallback-1']);
  });

  it('skips a model that just timed out on the next call, so it is not paid for twice', async () => {
    const calls = stubFetch({ primary: 'timeout', 'fallback-1': 'timeout', 'fallback-2': 'ok' });
    await extractStatementData(doc);
    await extractStatementData(doc);
    // Second call starts straight at the model that answered.
    expect(calls).toEqual(['primary', 'fallback-1', 'fallback-2', 'fallback-2']);
  });

  it('cools down an overloaded (503) model the same way', async () => {
    const calls = stubFetch({ primary: 503, 'fallback-1': 'ok' });
    await extractStatementData(doc);
    await extractStatementData(doc);
    expect(calls).toEqual(['primary', 'fallback-1', 'fallback-1']);
  });

  it('still tries cooling models last when every other model fails', async () => {
    const calls = stubFetch({ primary: 'timeout', 'fallback-1': 'timeout', 'fallback-2': 'timeout' });
    await expect(extractStatementData(doc)).rejects.toThrow(/timed out/);
    // All three cooling now; the next call still makes an attempt rather than giving up unread.
    stubFetch({ primary: 'ok', 'fallback-1': 'ok', 'fallback-2': 'ok' });
    await expect(extractStatementData(doc)).resolves.toEqual({ broker: 'Dime', rows: [] });
    expect(calls).toEqual(['primary', 'fallback-1', 'fallback-2']);
  });
});

describe('orderByAvailability', () => {
  const now = 1_000_000;

  it('keeps the configured order when nothing is cooling', () => {
    expect(orderByAvailability(['a', 'b', 'c'], now, new Map())).toEqual(['a', 'b', 'c']);
  });

  it('moves cooling models to the end, keeping relative order on both sides', () => {
    const until = new Map([['a', now + 1], ['c', now + 5]]);
    expect(orderByAvailability(['a', 'b', 'c', 'd'], now, until)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('treats an expired cooldown as ready', () => {
    expect(orderByAvailability(['a', 'b'], now, new Map([['a', now]]))).toEqual(['a', 'b']);
  });
});
