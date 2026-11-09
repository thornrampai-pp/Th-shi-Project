import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { isR2Configured } from '../../common/integrations/r2-storage.util';
import { SEC_FUND_EXCHANGE, isSecConfigured } from '../../common/integrations/sec-fund.util';
import { getRedisEvents } from '../../common/monitoring/redis-events';
import type { RedisEvent } from '../../common/monitoring/redis-events';
import {
  METRICS_KEYS,
  geminiModelUsage,
  keyGroup,
  parseRedisInfo,
  recentGeminiQuotaDays,
  tokensFromRecentMember,
  totalKeyspace,
  utcDay,
  utcMonth,
} from '../../common/monitoring/metrics-keys';
import type { GeminiModelUsage } from '../../common/monitoring/metrics-keys';
import { configuredGeminiModels } from '../../common/integrations/gemini.util';
import { DISCORD_API } from '../discord-bot/discord-api';
import type { CacheLogEntry, GeminiLogEntry, SecLogEntry } from '../../common/monitoring/usage-metrics';
import { getSlipStorageUsage } from '../storage/storage.service';

/**
 * Everything the admin System page shows, in one read. Each section degrades on its
 * own — a Redis outage still returns the connection log and R2 storage from the DB.
 */

const KEY_SCAN_LIMIT = 20_000;
const LOG_LIMIT = 50;

export interface RedisKeyGroup {
  group: string;
  count: number;
}

export interface RedisStatus {
  connected: boolean;
  /** ioredis client state: ready / connecting / reconnecting / end … */
  clientStatus: string;
  pingMs: number | null;
  error: string | null;
  version: string | null;
  mode: string | null;
  uptimeSeconds: number | null;
  connectedClients: number | null;
  maxClients: number | null;
  usedMemoryBytes: number | null;
  peakMemoryBytes: number | null;
  /** 0 = no limit configured on the server. */
  maxMemoryBytes: number | null;
  maxMemoryPolicy: string | null;
  opsPerSecond: number | null;
  totalCommands: number | null;
  keyspaceHits: number | null;
  keyspaceMisses: number | null;
  evictedKeys: number | null;
  expiredKeys: number | null;
  rejectedConnections: number | null;
  totalKeys: number | null;
  keysWithExpiry: number | null;
  keyGroups: RedisKeyGroup[];
  /** True when SCAN stopped at KEY_SCAN_LIMIT — group counts are then a sample. */
  keyGroupsTruncated: boolean;
  events: RedisEvent[];
}

export interface CacheStats {
  hitsToday: number;
  missesToday: number;
  groups: { group: string; hits: number; misses: number }[];
  log: CacheLogEntry[];
}

export interface GeminiDayUsage {
  day: string;
  requests: number;
  totalTokens: number;
  errors: number;
  rateLimited: number;
}

export interface GeminiStatus {
  configured: boolean;
  model: string;
  fallbackModels: string[];
  requestsLastMinute: number;
  tokensLastMinute: number;
  rpmLimit: number | null;
  tpmLimit: number | null;
  /** Per model — each model in the chain gets this many calls a day. */
  rpdLimit: number | null;
  today: GeminiDayUsage & { promptTokens: number; outputTokens: number; slipCalls: number; statementCalls: number };
  /** Today's calls per model against rpdLimit: the chain first, then other models called. */
  byModel: GeminiModelUsage[];
  history: GeminiDayUsage[];
  log: GeminiLogEntry[];
}

export interface R2Status {
  configured: boolean;
  bucket: string | null;
  usedBytes: number;
  quotaBytes: number;
  objectCount: number;
  month: string;
  classAOps: number;
  classALimit: number;
  classBOps: number;
  classBLimit: number;
}

export interface DiscordBotCheck {
  ok: boolean;
  checkedAt: Date;
  ms: number | null;
  botUsername: string | null;
  commands: string[];
  error: string | null;
}

export interface DiscordFailure {
  at: Date;
  channelLabel: string | null;
  eventType: string;
  error: string | null;
}

export interface DiscordStatus {
  publicKeySet: boolean;
  botTokenSet: boolean;
  applicationIdSet: boolean;
  /** Live check of the bot token + registered slash commands; null when not configured. */
  bot: DiscordBotCheck | null;
  lastInteractionAt: string | null;
  interactionsToday: number;
  interactionErrorsToday: number;
  invalidSignaturesToday: number;
  dmsToday: number;
  dmErrorsToday: number;
  interactionLabels: { label: string; count: number }[];
  linkedUsers: number;
  channels: number;
  activeChannels: number;
  sent24h: number;
  failed24h: number;
  pending24h: number;
  recentFailures: DiscordFailure[];
}

export interface SecStatus {
  configured: boolean;
  requestsToday: number;
  errorsToday: number;
  /** Fund assets known to the app / held in some portfolio. */
  funds: number;
  heldFunds: number;
  /** Newest stored NAV across held funds (yyyy-mm-dd), null if none. */
  latestNavDate: string | null;
  log: SecLogEntry[];
}

export interface SystemStatus {
  generatedAt: Date;
  redis: RedisStatus;
  cache: CacheStats;
  gemini: GeminiStatus;
  r2: R2Status;
  discord: DiscordStatus;
  sec: SecStatus;
}

function num(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function int(value: string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseJsonList<T>(items: string[]): T[] {
  return items.flatMap((item) => {
    try {
      return [JSON.parse(item) as T];
    } catch {
      return [];
    }
  });
}

/** Group counts via SCAN (never KEYS — it blocks the server), capped at KEY_SCAN_LIMIT. */
async function scanKeyGroups(): Promise<{ groups: RedisKeyGroup[]; truncated: boolean }> {
  const counts = new Map<string, number>();
  let cursor = '0';
  let scanned = 0;
  do {
    const [next, keys] = await redis.scan(cursor, 'COUNT', 1000);
    cursor = next;
    for (const key of keys) {
      const group = keyGroup(key);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    scanned += keys.length;
  } while (cursor !== '0' && scanned < KEY_SCAN_LIMIT);

  const groups = [...counts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group));
  return { groups, truncated: cursor !== '0' };
}

async function getRedisStatus(): Promise<RedisStatus> {
  const base: RedisStatus = {
    connected: false,
    clientStatus: redis.status,
    pingMs: null,
    error: null,
    version: null,
    mode: null,
    uptimeSeconds: null,
    connectedClients: null,
    maxClients: null,
    usedMemoryBytes: null,
    peakMemoryBytes: null,
    maxMemoryBytes: null,
    maxMemoryPolicy: null,
    opsPerSecond: null,
    totalCommands: null,
    keyspaceHits: null,
    keyspaceMisses: null,
    evictedKeys: null,
    expiredKeys: null,
    rejectedConnections: null,
    totalKeys: null,
    keysWithExpiry: null,
    keyGroups: [],
    keyGroupsTruncated: false,
    events: getRedisEvents(),
  };

  // Don't queue commands behind a dead connection — ioredis would hold them until it reconnects.
  if (redis.status !== 'ready') return { ...base, error: `Redis client is ${redis.status}` };

  try {
    const startedAt = performance.now();
    await redis.ping();
    const pingMs = performance.now() - startedAt;

    // INFO only (no CONFIG GET) — managed Redis hosts often block CONFIG; fields they
    // leave out of INFO come back null.
    const info = parseRedisInfo(await redis.info());
    const keyspace = totalKeyspace(info);
    const { groups, truncated } = await scanKeyGroups();

    return {
      ...base,
      connected: true,
      pingMs: Math.round(pingMs * 10) / 10,
      version: info.redis_version ?? null,
      mode: info.redis_mode ?? null,
      uptimeSeconds: num(info.uptime_in_seconds),
      connectedClients: num(info.connected_clients),
      maxClients: num(info.maxclients),
      usedMemoryBytes: num(info.used_memory),
      peakMemoryBytes: num(info.used_memory_peak),
      maxMemoryBytes: num(info.maxmemory),
      maxMemoryPolicy: info.maxmemory_policy ?? null,
      opsPerSecond: num(info.instantaneous_ops_per_sec),
      totalCommands: num(info.total_commands_processed),
      keyspaceHits: num(info.keyspace_hits),
      keyspaceMisses: num(info.keyspace_misses),
      evictedKeys: num(info.evicted_keys),
      expiredKeys: num(info.expired_keys),
      rejectedConnections: num(info.rejected_connections),
      totalKeys: keyspace.keys,
      keysWithExpiry: keyspace.expires,
      keyGroups: groups,
      keyGroupsTruncated: truncated,
    };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}

const emptyCache: CacheStats = { hitsToday: 0, missesToday: 0, groups: [], log: [] };

async function getCacheStats(): Promise<CacheStats> {
  if (redis.status !== 'ready') return emptyCache;
  try {
    const [day, log] = await Promise.all([
      redis.hgetall(METRICS_KEYS.cacheDay(utcDay())),
      redis.lrange(METRICS_KEYS.cacheLog, 0, LOG_LIMIT - 1),
    ]);

    const groups = new Map<string, { hits: number; misses: number }>();
    for (const [field, value] of Object.entries(day)) {
      const match = /^(hit|miss):(.+)$/.exec(field);
      if (!match) continue;
      const group = match[2]!;
      const entry = groups.get(group) ?? { hits: 0, misses: 0 };
      if (match[1] === 'hit') entry.hits += int(value);
      else entry.misses += int(value);
      groups.set(group, entry);
    }

    return {
      hitsToday: int(day.hits),
      missesToday: int(day.misses),
      groups: [...groups.entries()]
        .map(([group, c]) => ({ group, ...c }))
        .sort((a, b) => b.hits + b.misses - (a.hits + a.misses)),
      log: parseJsonList<CacheLogEntry>(log),
    };
  } catch {
    return emptyCache;
  }
}

function toDayUsage(day: string, fields: Record<string, string>): GeminiDayUsage {
  return {
    day,
    requests: int(fields.requests),
    totalTokens: int(fields.totalTokens),
    errors: int(fields.errors),
    rateLimited: int(fields.rateLimited),
  };
}

async function getGeminiStatus(): Promise<GeminiStatus> {
  const days = recentGeminiQuotaDays(7);
  const today = days[0]!;
  const base: GeminiStatus = {
    configured: Boolean(env.GEMINI_API_KEY),
    model: env.GEMINI_MODEL,
    fallbackModels: env.GEMINI_FALLBACK_MODELS,
    requestsLastMinute: 0,
    tokensLastMinute: 0,
    rpmLimit: env.GEMINI_RPM_LIMIT ?? null,
    tpmLimit: env.GEMINI_TPM_LIMIT ?? null,
    rpdLimit: env.GEMINI_RPD_LIMIT ?? null,
    today: { ...toDayUsage(today, {}), promptTokens: 0, outputTokens: 0, slipCalls: 0, statementCalls: 0 },
    byModel: geminiModelUsage(configuredGeminiModels(), {}, env.GEMINI_RPD_LIMIT ?? null),
    history: days.map((d) => toDayUsage(d, {})),
    log: [],
  };
  if (redis.status !== 'ready') return base;

  try {
    const now = Date.now();
    const pipeline = redis.pipeline().zrangebyscore(METRICS_KEYS.geminiRecent, now - 60_000, '+inf');
    for (const day of days) pipeline.hgetall(METRICS_KEYS.geminiDay(day));
    pipeline.lrange(METRICS_KEYS.geminiLog, 0, LOG_LIMIT - 1);
    const results = (await pipeline.exec()) ?? [];

    const recent = (results[0]?.[1] as string[] | undefined) ?? [];
    const dayFields = days.map((_, i) => (results[i + 1]?.[1] as Record<string, string> | undefined) ?? {});
    const log = (results[days.length + 1]?.[1] as string[] | undefined) ?? [];
    const todayFields = dayFields[0] ?? {};

    return {
      ...base,
      requestsLastMinute: recent.length,
      tokensLastMinute: recent.reduce((sum, m) => sum + tokensFromRecentMember(m), 0),
      today: {
        ...toDayUsage(today, todayFields),
        promptTokens: int(todayFields.promptTokens),
        outputTokens: int(todayFields.outputTokens),
        slipCalls: int(todayFields['kind:slip']),
        statementCalls: int(todayFields['kind:statement']),
      },
      byModel: geminiModelUsage(configuredGeminiModels(), todayFields, env.GEMINI_RPD_LIMIT ?? null),
      history: days.map((d, i) => toDayUsage(d, dayFields[i] ?? {})),
      log: parseJsonList<GeminiLogEntry>(log),
    };
  } catch {
    return base;
  }
}

async function getR2Status(): Promise<R2Status> {
  const month = utcMonth();
  const [storage, ops] = await Promise.all([
    getSlipStorageUsage(),
    redis.status === 'ready'
      ? redis.hgetall(METRICS_KEYS.r2Month(month)).catch(() => ({}) as Record<string, string>)
      : Promise.resolve({} as Record<string, string>),
  ]);
  return {
    configured: isR2Configured(),
    bucket: env.R2_BUCKET ?? null,
    usedBytes: storage.usedBytes,
    quotaBytes: storage.quotaBytes,
    objectCount: storage.objectCount,
    month,
    classAOps: int(ops.classA),
    classALimit: env.R2_CLASS_A_MONTHLY_LIMIT,
    classBOps: int(ops.classB),
    classBLimit: env.R2_CLASS_B_MONTHLY_LIMIT,
  };
}

// The page refreshes every 15s; Discord doesn't need asking that often.
const BOT_CHECK_TTL_MS = 60_000;
let botCheckCache: DiscordBotCheck | null = null;

async function checkDiscordBot(): Promise<DiscordBotCheck | null> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_APPLICATION_ID) return null;
  if (botCheckCache && Date.now() - botCheckCache.checkedAt.getTime() < BOT_CHECK_TTL_MS) return botCheckCache;

  const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` };
  const startedAt = performance.now();
  let check: DiscordBotCheck;
  try {
    const [me, commands] = await Promise.all([
      fetch(`${DISCORD_API}/users/@me`, { headers, signal: AbortSignal.timeout(5000) }),
      fetch(`${DISCORD_API}/applications/${env.DISCORD_APPLICATION_ID}/commands`, {
        headers,
        signal: AbortSignal.timeout(5000),
      }),
    ]);
    const ms = Math.round(performance.now() - startedAt);
    if (!me.ok) {
      check = { ok: false, checkedAt: new Date(), ms, botUsername: null, commands: [], error: `GET /users/@me → ${me.status}` };
    } else {
      const user = (await me.json()) as { username?: string };
      const list = commands.ok ? ((await commands.json()) as { name: string }[]) : [];
      check = {
        ok: commands.ok,
        checkedAt: new Date(),
        ms,
        botUsername: user.username ?? null,
        commands: list.map((c) => c.name).sort(),
        error: commands.ok ? null : `GET /applications/…/commands → ${commands.status}`,
      };
    }
  } catch (err) {
    check = {
      ok: false,
      checkedAt: new Date(),
      ms: null,
      botUsername: null,
      commands: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
  botCheckCache = check;
  return check;
}

async function getDiscordStatus(): Promise<DiscordStatus> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const readRedis = async () => {
    if (redis.status !== 'ready') return { day: {} as Record<string, string>, last: null as string | null };
    try {
      const [day, last] = await Promise.all([
        redis.hgetall(METRICS_KEYS.discordDay(utcDay())),
        redis.get(METRICS_KEYS.discordLastInteraction),
      ]);
      return { day, last };
    } catch {
      return { day: {} as Record<string, string>, last: null as string | null };
    }
  };

  const [bot, { day, last }, linkedUsers, channels, activeChannels, logCounts, failures] = await Promise.all([
    checkDiscordBot(),
    readRedis(),
    prisma.user.count({ where: { discordUserId: { not: null }, deletedAt: null } }),
    prisma.notificationChannel.count(),
    prisma.notificationChannel.count({ where: { isActive: true } }),
    prisma.notificationLog.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.notificationLog.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { createdAt: true, eventType: true, errorMessage: true, channel: { select: { label: true } } },
    }),
  ]);

  const countFor = (status: string) => logCounts.find((c) => c.status === status)?._count._all ?? 0;
  const interactionLabels = Object.entries(day)
    .flatMap(([field, value]) => (field.startsWith('label:') ? [{ label: field.slice(6), count: int(value) }] : []))
    .sort((a, b) => b.count - a.count);

  return {
    publicKeySet: Boolean(env.DISCORD_PUBLIC_KEY),
    botTokenSet: Boolean(env.DISCORD_BOT_TOKEN),
    applicationIdSet: Boolean(env.DISCORD_APPLICATION_ID),
    bot,
    lastInteractionAt: last,
    interactionsToday: int(day.interaction),
    interactionErrorsToday: int(day['interaction:error']),
    invalidSignaturesToday: int(day.invalidSignature),
    dmsToday: int(day.dm),
    dmErrorsToday: int(day['dm:error']),
    interactionLabels,
    linkedUsers,
    channels,
    activeChannels,
    sent24h: countFor('SENT'),
    failed24h: countFor('FAILED'),
    pending24h: countFor('PENDING'),
    recentFailures: failures.map((f) => ({
      at: f.createdAt,
      channelLabel: f.channel.label,
      eventType: f.eventType,
      error: f.errorMessage?.slice(0, 300) ?? null,
    })),
  };
}

async function getSecStatus(): Promise<SecStatus> {
  const heldWhere = { exchange: SEC_FUND_EXCHANGE, positions: { some: { quantity: { gt: 0 } } } };
  const [funds, heldFunds, latestNav, metrics] = await Promise.all([
    prisma.asset.count({ where: { exchange: SEC_FUND_EXCHANGE } }),
    prisma.asset.count({ where: heldWhere }),
    prisma.assetPrice.findFirst({
      where: { timeframe: '1D', asset: heldWhere },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    }),
    (async () => {
      if (redis.status !== 'ready') return { day: {} as Record<string, string>, log: [] as string[] };
      try {
        const [day, log] = await Promise.all([
          redis.hgetall(METRICS_KEYS.secDay(utcDay())),
          redis.lrange(METRICS_KEYS.secLog, 0, LOG_LIMIT - 1),
        ]);
        return { day, log };
      } catch {
        return { day: {} as Record<string, string>, log: [] as string[] };
      }
    })(),
  ]);
  return {
    configured: isSecConfigured(),
    requestsToday: int(metrics.day.requests),
    errorsToday: int(metrics.day.errors),
    funds,
    heldFunds,
    latestNavDate: latestNav ? latestNav.timestamp.toISOString().slice(0, 10) : null,
    log: parseJsonList<SecLogEntry>(metrics.log),
  };
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const [redisStatus, cache, gemini, r2, discord, sec] = await Promise.all([
    getRedisStatus(),
    getCacheStats(),
    getGeminiStatus(),
    getR2Status(),
    getDiscordStatus(),
    getSecStatus(),
  ]);
  return { generatedAt: new Date(), redis: redisStatus, cache, gemini, r2, discord, sec };
}
