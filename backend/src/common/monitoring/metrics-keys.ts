/**
 * Pure helpers for the usage metrics — key names, quota-window dates and parsing.
 * No I/O, unit tested.
 */

/** Every metrics key lives under this prefix, so the System page can tell them apart. */
export const METRICS_PREFIX = 'sys:';

export const METRICS_KEYS = {
  cacheDay: (day: string) => `sys:cache:day:${day}`,
  cacheLog: 'sys:cache:log',
  geminiDay: (day: string) => `sys:gemini:day:${day}`,
  /** Sorted set of calls in the last minute — score = ms timestamp, member carries tokens. */
  geminiRecent: 'sys:gemini:recent',
  geminiLog: 'sys:gemini:log',
  r2Month: (month: string) => `sys:r2:month:${month}`,
  discordDay: (day: string) => `sys:discord:day:${day}`,
  discordLastInteraction: 'sys:discord:last-interaction',
  secDay: (day: string) => `sys:sec:day:${day}`,
  secLog: 'sys:sec:log',
} as const;

const pacificDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Gemini's per-day quota resets at midnight Pacific time, so its days are counted in PT. */
export function geminiQuotaDay(date: Date = new Date()): string {
  return pacificDay.format(date); // en-CA formats as yyyy-mm-dd
}

/** The last `count` Gemini quota days, newest first. */
export function recentGeminiQuotaDays(count: number, now: Date = new Date()): string[] {
  const days: string[] = [];
  for (let i = 0; i < count; i += 1) {
    days.push(geminiQuotaDay(new Date(now.getTime() - i * 24 * 3600 * 1000)));
  }
  return [...new Set(days)];
}

export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** R2 bills operations per calendar month (UTC). */
export function utcMonth(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

/** Sorted-set member for one Gemini call: unique per call, and carries its token count. */
export function geminiRecentMember(atMs: number, tokens: number): string {
  return `${atMs}-${Math.random().toString(36).slice(2, 8)}|${tokens}`;
}

export function tokensFromRecentMember(member: string): number {
  const tokens = Number(member.split('|')[1]);
  return Number.isFinite(tokens) ? tokens : 0;
}

/** Day-hash field holding one model's call count (every call, failed ones included). */
export const geminiModelField = (model: string) => `model:${model}`;
/** Day-hash field holding one model's failed-call count. */
export const geminiModelErrorField = (model: string) => `modelErrors:${model}`;

/** Per-model call counts from a `sys:gemini:day:<day>` hash: `{ model: calls }`. */
export function geminiModelCounts(fields: Record<string, string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [field, value] of Object.entries(fields)) {
    if (field.startsWith('model:')) counts[field.slice('model:'.length)] = Number(value) || 0;
  }
  return counts;
}

export interface GeminiModelUsage {
  model: string;
  requests: number;
  errors: number;
  /** GEMINI_RPD_LIMIT — the daily quota is per model, so every model gets the full limit. */
  limit: number | null;
  /** Part of the current GEMINI_MODEL → fallback chain (vs. called earlier today only). */
  inChain: boolean;
}

/** Today's usage per model: the configured chain first (in order), then anything else called. */
export function geminiModelUsage(
  chain: string[],
  fields: Record<string, string>,
  limit: number | null,
): GeminiModelUsage[] {
  const counts = geminiModelCounts(fields);
  const others = Object.keys(counts).filter((m) => !chain.includes(m)).sort();
  return [...chain.map((m) => [m, true] as const), ...others.map((m) => [m, false] as const)].map(([model, inChain]) => ({
    model,
    requests: counts[model] ?? 0,
    errors: Number(fields[geminiModelErrorField(model)]) || 0,
    limit,
    inChain,
  }));
}

/**
 * Groups a key by its namespace so ids never become their own group:
 * `quote:AAPL` → `quote`, `history:price-tail:<id>:<day>` → `history:price-tail`,
 * `sys:gemini:day:2026-11-05` → `sys:gemini`.
 */
export function keyGroup(key: string): string {
  const parts = key.split(':');
  const second = parts[1] ?? '';
  // A name like `price-tail` or `r2` — not a hex id/uuid that happens to start with a letter.
  const isName = /^[a-z][a-z0-9_-]*$/.test(second) && !/^[0-9a-f-]{8,}$/.test(second);
  if (parts.length >= 3 && isName) return `${parts[0]}:${second}`;
  return parts[0] ?? key;
}

/** Readable label for a Discord interaction: `/upload-slip`, `component`, `modal` … */
export function discordInteractionLabel(type: number, commandName: string | undefined): string {
  switch (type) {
    case 1:
      return 'ping';
    case 2:
      return commandName ? `/${commandName}` : 'command';
    case 3:
      return 'component';
    case 4:
      return commandName ? `autocomplete /${commandName}` : 'autocomplete';
    case 5:
      return 'modal';
    default:
      return `type ${type}`;
  }
}

/** Parses `INFO` output into a flat field → value map (section headers dropped). */
export function parseRedisInfo(info: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of info.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx > 0) fields[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return fields;
}

/** Sums `keys=` across every `dbN:keys=..,expires=..` line of INFO keyspace. */
export function totalKeyspace(fields: Record<string, string>): { keys: number; expires: number } {
  let keys = 0;
  let expires = 0;
  for (const [field, value] of Object.entries(fields)) {
    if (!/^db\d+$/.test(field)) continue;
    keys += Number(/keys=(\d+)/.exec(value)?.[1] ?? 0);
    expires += Number(/expires=(\d+)/.exec(value)?.[1] ?? 0);
  }
  return { keys, expires };
}
