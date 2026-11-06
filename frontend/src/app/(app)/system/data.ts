import type { SystemStatusQuery } from "@/gql/graphql";
import { compact } from "@/lib/graphql/normalize";

// Narrows the all-nullable SystemStatus result once, so the sections never null-check.

type Raw = NonNullable<SystemStatusQuery["systemStatus"]>;

const n = (v: number | null | undefined) => v ?? 0;

export function toGemini(g: Raw["gemini"] | undefined) {
  const today = g?.today;
  return {
    configured: !!g?.configured,
    model: g?.model ?? "—",
    fallbackModels: compact(g?.fallbackModels),
    requestsLastMinute: n(g?.requestsLastMinute),
    tokensLastMinute: n(g?.tokensLastMinute),
    rpmLimit: g?.rpmLimit ?? null,
    tpmLimit: g?.tpmLimit ?? null,
    rpdLimit: g?.rpdLimit ?? null,
    today: {
      day: today?.day ?? "",
      requests: n(today?.requests),
      totalTokens: n(today?.totalTokens),
      promptTokens: n(today?.promptTokens),
      outputTokens: n(today?.outputTokens),
      errors: n(today?.errors),
      rateLimited: n(today?.rateLimited),
      slipCalls: n(today?.slipCalls),
      statementCalls: n(today?.statementCalls),
    },
    history: compact(g?.history).map((d) => ({
      day: d.day ?? "",
      requests: n(d.requests),
      totalTokens: n(d.totalTokens),
      errors: n(d.errors),
      rateLimited: n(d.rateLimited),
    })),
    log: compact(g?.log).map((l) => ({
      at: l.at ?? "",
      kind: l.kind ?? "",
      model: l.model ?? null,
      ok: !!l.ok,
      status: l.status ?? null,
      ms: n(l.ms),
      totalTokens: n(l.totalTokens),
      error: l.error ?? null,
    })),
  };
}

export function toR2(r: Raw["r2"] | undefined) {
  return {
    configured: !!r?.configured,
    bucket: r?.bucket ?? null,
    usedBytes: n(r?.usedBytes),
    quotaBytes: n(r?.quotaBytes),
    objectCount: n(r?.objectCount),
    month: r?.month ?? "",
    classAOps: n(r?.classAOps),
    classALimit: n(r?.classALimit),
    classBOps: n(r?.classBOps),
    classBLimit: n(r?.classBLimit),
  };
}

export function toRedis(r: Raw["redis"] | undefined) {
  return {
    connected: !!r?.connected,
    clientStatus: r?.clientStatus ?? "unknown",
    pingMs: r?.pingMs ?? null,
    error: r?.error ?? null,
    version: r?.version ?? null,
    mode: r?.mode ?? null,
    uptimeSeconds: r?.uptimeSeconds ?? null,
    connectedClients: r?.connectedClients ?? null,
    maxClients: r?.maxClients ?? null,
    usedMemoryBytes: r?.usedMemoryBytes ?? null,
    peakMemoryBytes: r?.peakMemoryBytes ?? null,
    maxMemoryBytes: r?.maxMemoryBytes ?? null,
    maxMemoryPolicy: r?.maxMemoryPolicy ?? null,
    opsPerSecond: r?.opsPerSecond ?? null,
    totalCommands: r?.totalCommands ?? null,
    keyspaceHits: r?.keyspaceHits ?? null,
    keyspaceMisses: r?.keyspaceMisses ?? null,
    evictedKeys: r?.evictedKeys ?? null,
    expiredKeys: r?.expiredKeys ?? null,
    rejectedConnections: r?.rejectedConnections ?? null,
    totalKeys: r?.totalKeys ?? null,
    keysWithExpiry: r?.keysWithExpiry ?? null,
    keyGroups: compact(r?.keyGroups).map((g) => ({ group: g.group ?? "?", count: n(g.count) })),
    keyGroupsTruncated: !!r?.keyGroupsTruncated,
    events: compact(r?.events).map((e) => ({ at: e.at ?? "", type: e.type ?? "", message: e.message ?? null })),
  };
}

export function toCache(c: Raw["cache"] | undefined) {
  return {
    hitsToday: n(c?.hitsToday),
    missesToday: n(c?.missesToday),
    groups: compact(c?.groups).map((g) => ({ group: g.group ?? "?", hits: n(g.hits), misses: n(g.misses) })),
    log: compact(c?.log).map((l) => ({
      at: l.at ?? "",
      key: l.key ?? "",
      group: l.group ?? "",
      hit: !!l.hit,
      ms: n(l.ms),
    })),
  };
}

export function toDiscord(d: Raw["discord"] | undefined) {
  const bot = d?.bot;
  return {
    publicKeySet: !!d?.publicKeySet,
    botTokenSet: !!d?.botTokenSet,
    applicationIdSet: !!d?.applicationIdSet,
    bot: bot
      ? {
          ok: !!bot.ok,
          checkedAt: bot.checkedAt ?? "",
          ms: bot.ms ?? null,
          botUsername: bot.botUsername ?? null,
          commands: compact(bot.commands),
          error: bot.error ?? null,
        }
      : null,
    lastInteractionAt: d?.lastInteractionAt ?? null,
    interactionsToday: n(d?.interactionsToday),
    interactionErrorsToday: n(d?.interactionErrorsToday),
    invalidSignaturesToday: n(d?.invalidSignaturesToday),
    dmsToday: n(d?.dmsToday),
    dmErrorsToday: n(d?.dmErrorsToday),
    interactionLabels: compact(d?.interactionLabels).map((l) => ({ label: l.label ?? "?", count: n(l.count) })),
    linkedUsers: n(d?.linkedUsers),
    channels: n(d?.channels),
    activeChannels: n(d?.activeChannels),
    sent24h: n(d?.sent24h),
    failed24h: n(d?.failed24h),
    pending24h: n(d?.pending24h),
    recentFailures: compact(d?.recentFailures).map((f) => ({
      at: f.at ?? "",
      channelLabel: f.channelLabel ?? null,
      eventType: f.eventType ?? "",
      error: f.error ?? null,
    })),
  };
}

export type Discord = ReturnType<typeof toDiscord>;
export type Gemini = ReturnType<typeof toGemini>;
export type R2 = ReturnType<typeof toR2>;
export type RedisInfo = ReturnType<typeof toRedis>;
export type Cache = ReturnType<typeof toCache>;
