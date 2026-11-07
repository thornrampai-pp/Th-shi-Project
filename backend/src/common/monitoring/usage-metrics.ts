import { redis } from '../../config/redis';
import {
  METRICS_KEYS,
  geminiQuotaDay,
  geminiRecentMember,
  keyGroup,
  utcDay,
  utcMonth,
} from './metrics-keys';

/**
 * Usage counters behind the admin System page (Gemini quota, R2 operations, cache
 * hits). Every recorder is fire-and-forget: a metrics write must never fail or slow
 * down the request it's measuring, so errors are swallowed and nothing is awaited by
 * the caller.
 */

const CACHE_LOG_SIZE = 200;
const GEMINI_LOG_SIZE = 100;
const DAY_TTL_SECONDS = 8 * 24 * 3600; // a week of daily history, plus a day of slack
const MONTH_TTL_SECONDS = 400 * 24 * 3600;
const RECENT_WINDOW_MS = 60_000;

function swallow(promise: Promise<unknown>): void {
  promise.catch(() => {});
}

// ─── Cache ──────────────────────────────────────────────────────────────────

export interface CacheLogEntry {
  at: string;
  key: string;
  group: string;
  hit: boolean;
  /** Time to serve: the Redis read on a hit, read + fetcher + write on a miss. */
  ms: number;
}

export function recordCacheAccess(key: string, hit: boolean, ms: number): void {
  const group = keyGroup(key);
  const day = METRICS_KEYS.cacheDay(utcDay());
  const entry: CacheLogEntry = { at: new Date().toISOString(), key, group, hit, ms: Math.round(ms) };
  swallow(
    redis
      .multi()
      .hincrby(day, hit ? 'hits' : 'misses', 1)
      .hincrby(day, `${hit ? 'hit' : 'miss'}:${group}`, 1)
      .expire(day, DAY_TTL_SECONDS)
      .lpush(METRICS_KEYS.cacheLog, JSON.stringify(entry))
      .ltrim(METRICS_KEYS.cacheLog, 0, CACHE_LOG_SIZE - 1)
      .exec(),
  );
}

// ─── Gemini ─────────────────────────────────────────────────────────────────

export type GeminiCallKind = 'slip' | 'statement';

export interface GeminiCallRecord {
  kind: GeminiCallKind;
  /** The model that served (or failed) this request — differs from GEMINI_MODEL after a fallback. */
  model: string;
  ok: boolean;
  /** HTTP status, or null when the request never got a response (timeout, network). */
  status: number | null;
  ms: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  error: string | null;
}

export interface GeminiLogEntry extends GeminiCallRecord {
  at: string;
}

export function recordGeminiCall(call: GeminiCallRecord): void {
  const now = Date.now();
  const day = METRICS_KEYS.geminiDay(geminiQuotaDay(new Date(now)));
  const entry: GeminiLogEntry = { ...call, ms: Math.round(call.ms), error: call.error?.slice(0, 300) ?? null, at: new Date(now).toISOString() };

  const tx = redis
    .multi()
    // Failed calls count too — Google counts every request against RPM/RPD.
    .zadd(METRICS_KEYS.geminiRecent, now, geminiRecentMember(now, call.totalTokens))
    .zremrangebyscore(METRICS_KEYS.geminiRecent, 0, now - RECENT_WINDOW_MS)
    .expire(METRICS_KEYS.geminiRecent, 120)
    .hincrby(day, 'requests', 1)
    .hincrby(day, 'promptTokens', call.promptTokens)
    .hincrby(day, 'outputTokens', call.outputTokens)
    .hincrby(day, 'totalTokens', call.totalTokens)
    .hincrby(day, `kind:${call.kind}`, 1)
    .hincrby(day, `model:${call.model}`, 1);
  if (!call.ok) tx.hincrby(day, 'errors', 1);
  if (call.status === 429) tx.hincrby(day, 'rateLimited', 1);
  tx.expire(day, DAY_TTL_SECONDS)
    .lpush(METRICS_KEYS.geminiLog, JSON.stringify(entry))
    .ltrim(METRICS_KEYS.geminiLog, 0, GEMINI_LOG_SIZE - 1);

  swallow(tx.exec());
}

// ─── Discord ────────────────────────────────────────────────────────────────

/**
 * `interaction` = a signed request to /discord/interactions (label = command etc.),
 * `invalidSignature` = a request that failed verification, `dm` = a bot DM send.
 */
export type DiscordEventKind = 'interaction' | 'invalidSignature' | 'dm';

export function recordDiscordEvent(kind: DiscordEventKind, ok: boolean, label?: string): void {
  const day = METRICS_KEYS.discordDay(utcDay());
  const tx = redis.multi().hincrby(day, kind, 1);
  if (!ok) tx.hincrby(day, `${kind}:error`, 1);
  if (label) tx.hincrby(day, `label:${label}`, 1);
  if (kind === 'interaction') tx.set(METRICS_KEYS.discordLastInteraction, new Date().toISOString());
  swallow(tx.expire(day, DAY_TTL_SECONDS).exec());
}

// ─── SEC Open API (Thai funds) ──────────────────────────────────────────────

export interface SecLogEntry {
  at: string;
  path: string;
  ok: boolean;
  status: number | null;
  ms: number;
  error: string | null;
}

const SEC_LOG_SIZE = 50;

export function recordSecCall(path: string, ok: boolean, status: number | null, ms: number, error: string | null): void {
  const day = METRICS_KEYS.secDay(utcDay());
  const entry: SecLogEntry = { at: new Date().toISOString(), path, ok, status, ms: Math.round(ms), error: error?.slice(0, 300) ?? null };
  const tx = redis.multi().hincrby(day, 'requests', 1).hincrby(day, `path:${path}`, 1);
  if (!ok) tx.hincrby(day, 'errors', 1);
  swallow(
    tx
      .expire(day, DAY_TTL_SECONDS)
      .lpush(METRICS_KEYS.secLog, JSON.stringify(entry))
      .ltrim(METRICS_KEYS.secLog, 0, SEC_LOG_SIZE - 1)
      .exec(),
  );
}

// ─── Cloudflare R2 ──────────────────────────────────────────────────────────

/**
 * R2 bills Class A (writes/lists) and Class B (reads) per month; deletes are free.
 * Reads go straight from the browser through presigned URLs, so Class B is counted
 * per URL issued — an estimate, since a URL may be fetched more than once or not at all.
 */
export type R2OperationClass = 'classA' | 'classB';

export function recordR2Operation(opClass: R2OperationClass): void {
  const month = METRICS_KEYS.r2Month(utcMonth());
  swallow(redis.multi().hincrby(month, opClass, 1).expire(month, MONTH_TTL_SECONDS).exec());
}
