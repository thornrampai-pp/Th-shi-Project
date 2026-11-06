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
