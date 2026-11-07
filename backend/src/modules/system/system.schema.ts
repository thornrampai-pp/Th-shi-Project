import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAdmin } from '../../common/middlewares/auth.middleware';
import type { RedisEvent } from '../../common/monitoring/redis-events';
import type { CacheLogEntry, GeminiLogEntry, SecLogEntry } from '../../common/monitoring/usage-metrics';
import * as systemService from './system.service';
import type {
  CacheStats,
  DiscordBotCheck,
  DiscordFailure,
  DiscordStatus,
  GeminiDayUsage,
  GeminiStatus,
  R2Status,
  RedisKeyGroup,
  SecStatus,
  RedisStatus,
  SystemStatus,
} from './system.service';

// Byte sizes and lifetime counters can pass 2^31, so they're Float rather than Int.

const RedisEventType = builder.objectRef<RedisEvent>('RedisEvent').implement({
  fields: (t) => ({
    at: t.field({ type: 'String', resolve: (e) => e.at.toISOString() }),
    type: t.exposeString('type'),
    message: t.exposeString('message', { nullable: true }),
  }),
});

const RedisKeyGroupType = builder.objectRef<RedisKeyGroup>('RedisKeyGroup').implement({
  fields: (t) => ({
    group: t.exposeString('group'),
    count: t.exposeInt('count'),
  }),
});

const RedisStatusType = builder.objectRef<RedisStatus>('RedisStatus').implement({
  fields: (t) => ({
    connected: t.exposeBoolean('connected'),
    clientStatus: t.exposeString('clientStatus'),
    pingMs: t.exposeFloat('pingMs', { nullable: true }),
    error: t.exposeString('error', { nullable: true }),
    version: t.exposeString('version', { nullable: true }),
    mode: t.exposeString('mode', { nullable: true }),
    uptimeSeconds: t.exposeFloat('uptimeSeconds', { nullable: true }),
    connectedClients: t.exposeInt('connectedClients', { nullable: true }),
    maxClients: t.exposeInt('maxClients', { nullable: true }),
    usedMemoryBytes: t.exposeFloat('usedMemoryBytes', { nullable: true }),
    peakMemoryBytes: t.exposeFloat('peakMemoryBytes', { nullable: true }),
    maxMemoryBytes: t.exposeFloat('maxMemoryBytes', { nullable: true }),
    maxMemoryPolicy: t.exposeString('maxMemoryPolicy', { nullable: true }),
    opsPerSecond: t.exposeFloat('opsPerSecond', { nullable: true }),
    totalCommands: t.exposeFloat('totalCommands', { nullable: true }),
    keyspaceHits: t.exposeFloat('keyspaceHits', { nullable: true }),
    keyspaceMisses: t.exposeFloat('keyspaceMisses', { nullable: true }),
    evictedKeys: t.exposeFloat('evictedKeys', { nullable: true }),
    expiredKeys: t.exposeFloat('expiredKeys', { nullable: true }),
    rejectedConnections: t.exposeFloat('rejectedConnections', { nullable: true }),
    totalKeys: t.exposeFloat('totalKeys', { nullable: true }),
    keysWithExpiry: t.exposeFloat('keysWithExpiry', { nullable: true }),
    keyGroups: t.field({ type: [RedisKeyGroupType], resolve: (s) => s.keyGroups }),
    keyGroupsTruncated: t.exposeBoolean('keyGroupsTruncated'),
    events: t.field({ type: [RedisEventType], resolve: (s) => s.events }),
  }),
});

const CacheLogEntryType = builder.objectRef<CacheLogEntry>('CacheLogEntry').implement({
  fields: (t) => ({
    at: t.exposeString('at'),
    key: t.exposeString('key'),
    group: t.exposeString('group'),
    hit: t.exposeBoolean('hit'),
    ms: t.exposeFloat('ms'),
  }),
});

const CacheGroupStatsType = builder
  .objectRef<CacheStats['groups'][number]>('CacheGroupStats')
  .implement({
    fields: (t) => ({
      group: t.exposeString('group'),
      hits: t.exposeInt('hits'),
      misses: t.exposeInt('misses'),
    }),
  });

const CacheStatsType = builder.objectRef<CacheStats>('CacheStats').implement({
  fields: (t) => ({
    hitsToday: t.exposeInt('hitsToday'),
    missesToday: t.exposeInt('missesToday'),
    groups: t.field({ type: [CacheGroupStatsType], resolve: (s) => s.groups }),
    log: t.field({ type: [CacheLogEntryType], resolve: (s) => s.log }),
  }),
});

const GeminiDayUsageType = builder.objectRef<GeminiDayUsage>('GeminiDayUsage').implement({
  fields: (t) => ({
    day: t.exposeString('day'),
    requests: t.exposeInt('requests'),
    totalTokens: t.exposeFloat('totalTokens'),
    errors: t.exposeInt('errors'),
    rateLimited: t.exposeInt('rateLimited'),
  }),
});

const GeminiTodayType = builder.objectRef<GeminiStatus['today']>('GeminiToday').implement({
  fields: (t) => ({
    day: t.exposeString('day'),
    requests: t.exposeInt('requests'),
    totalTokens: t.exposeFloat('totalTokens'),
    promptTokens: t.exposeFloat('promptTokens'),
    outputTokens: t.exposeFloat('outputTokens'),
    errors: t.exposeInt('errors'),
    rateLimited: t.exposeInt('rateLimited'),
    slipCalls: t.exposeInt('slipCalls'),
    statementCalls: t.exposeInt('statementCalls'),
  }),
});

const GeminiLogEntryType = builder.objectRef<GeminiLogEntry>('GeminiLogEntry').implement({
  fields: (t) => ({
    at: t.exposeString('at'),
    kind: t.exposeString('kind'),
    // Entries logged before fallback models existed have no model.
    model: t.string({ nullable: true, resolve: (l) => l.model ?? null }),
    ok: t.exposeBoolean('ok'),
    status: t.exposeInt('status', { nullable: true }),
    ms: t.exposeFloat('ms'),
    promptTokens: t.exposeFloat('promptTokens'),
    outputTokens: t.exposeFloat('outputTokens'),
    totalTokens: t.exposeFloat('totalTokens'),
    error: t.exposeString('error', { nullable: true }),
  }),
});

const GeminiStatusType = builder.objectRef<GeminiStatus>('GeminiStatus').implement({
  fields: (t) => ({
    configured: t.exposeBoolean('configured'),
    model: t.exposeString('model'),
    fallbackModels: t.exposeStringList('fallbackModels'),
    requestsLastMinute: t.exposeInt('requestsLastMinute'),
    tokensLastMinute: t.exposeFloat('tokensLastMinute'),
    rpmLimit: t.exposeInt('rpmLimit', { nullable: true }),
    tpmLimit: t.exposeFloat('tpmLimit', { nullable: true }),
    rpdLimit: t.exposeInt('rpdLimit', { nullable: true }),
    today: t.field({ type: GeminiTodayType, resolve: (s) => s.today }),
    history: t.field({ type: [GeminiDayUsageType], resolve: (s) => s.history }),
    log: t.field({ type: [GeminiLogEntryType], resolve: (s) => s.log }),
  }),
});

const R2StatusType = builder.objectRef<R2Status>('R2Status').implement({
  fields: (t) => ({
    configured: t.exposeBoolean('configured'),
    bucket: t.exposeString('bucket', { nullable: true }),
    usedBytes: t.exposeFloat('usedBytes'),
    quotaBytes: t.exposeFloat('quotaBytes'),
    objectCount: t.exposeInt('objectCount'),
    month: t.exposeString('month'),
    classAOps: t.exposeInt('classAOps'),
    classALimit: t.exposeInt('classALimit'),
    classBOps: t.exposeInt('classBOps'),
    classBLimit: t.exposeInt('classBLimit'),
  }),
});

const DiscordBotCheckType = builder.objectRef<DiscordBotCheck>('DiscordBotCheck').implement({
  fields: (t) => ({
    ok: t.exposeBoolean('ok'),
    checkedAt: t.field({ type: 'String', resolve: (c) => c.checkedAt.toISOString() }),
    ms: t.exposeInt('ms', { nullable: true }),
    botUsername: t.exposeString('botUsername', { nullable: true }),
    commands: t.exposeStringList('commands'),
    error: t.exposeString('error', { nullable: true }),
  }),
});

const DiscordFailureType = builder.objectRef<DiscordFailure>('DiscordFailure').implement({
  fields: (t) => ({
    at: t.field({ type: 'String', resolve: (f) => f.at.toISOString() }),
    channelLabel: t.exposeString('channelLabel', { nullable: true }),
    eventType: t.exposeString('eventType'),
    error: t.exposeString('error', { nullable: true }),
  }),
});

const DiscordLabelCountType = builder
  .objectRef<DiscordStatus['interactionLabels'][number]>('DiscordLabelCount')
  .implement({
    fields: (t) => ({
      label: t.exposeString('label'),
      count: t.exposeInt('count'),
    }),
  });

const DiscordStatusType = builder.objectRef<DiscordStatus>('DiscordStatus').implement({
  fields: (t) => ({
    publicKeySet: t.exposeBoolean('publicKeySet'),
    botTokenSet: t.exposeBoolean('botTokenSet'),
    applicationIdSet: t.exposeBoolean('applicationIdSet'),
    bot: t.field({ type: DiscordBotCheckType, nullable: true, resolve: (s) => s.bot }),
    lastInteractionAt: t.exposeString('lastInteractionAt', { nullable: true }),
    interactionsToday: t.exposeInt('interactionsToday'),
    interactionErrorsToday: t.exposeInt('interactionErrorsToday'),
    invalidSignaturesToday: t.exposeInt('invalidSignaturesToday'),
    dmsToday: t.exposeInt('dmsToday'),
    dmErrorsToday: t.exposeInt('dmErrorsToday'),
    interactionLabels: t.field({ type: [DiscordLabelCountType], resolve: (s) => s.interactionLabels }),
    linkedUsers: t.exposeInt('linkedUsers'),
    channels: t.exposeInt('channels'),
    activeChannels: t.exposeInt('activeChannels'),
    sent24h: t.exposeInt('sent24h'),
    failed24h: t.exposeInt('failed24h'),
    pending24h: t.exposeInt('pending24h'),
    recentFailures: t.field({ type: [DiscordFailureType], resolve: (s) => s.recentFailures }),
  }),
});

const SecLogEntryType = builder.objectRef<SecLogEntry>('SecLogEntry').implement({
  fields: (t) => ({
    at: t.exposeString('at'),
    path: t.exposeString('path'),
    ok: t.exposeBoolean('ok'),
    status: t.exposeInt('status', { nullable: true }),
    ms: t.exposeFloat('ms'),
    error: t.exposeString('error', { nullable: true }),
  }),
});

const SecStatusType = builder.objectRef<SecStatus>('SecStatus').implement({
  fields: (t) => ({
    configured: t.exposeBoolean('configured'),
    requestsToday: t.exposeInt('requestsToday'),
    errorsToday: t.exposeInt('errorsToday'),
    funds: t.exposeInt('funds'),
    heldFunds: t.exposeInt('heldFunds'),
    latestNavDate: t.exposeString('latestNavDate', { nullable: true }),
    log: t.field({ type: [SecLogEntryType], resolve: (s) => s.log }),
  }),
});

const SystemStatusType = builder.objectRef<SystemStatus>('SystemStatus').implement({
  fields: (t) => ({
    generatedAt: t.field({ type: 'String', resolve: (s) => s.generatedAt.toISOString() }),
    redis: t.field({ type: RedisStatusType, resolve: (s) => s.redis }),
    cache: t.field({ type: CacheStatsType, resolve: (s) => s.cache }),
    gemini: t.field({ type: GeminiStatusType, resolve: (s) => s.gemini }),
    r2: t.field({ type: R2StatusType, resolve: (s) => s.r2 }),
    discord: t.field({ type: DiscordStatusType, resolve: (s) => s.discord }),
    sec: t.field({ type: SecStatusType, resolve: (s) => s.sec }),
  }),
});

builder.queryField('systemStatus', (t) =>
  t.field({
    type: SystemStatusType,
    description: 'Admin only — Redis health/keys/logs, cache hit rate, Gemini quota usage, Cloudflare R2 usage, Discord connectivity and the SEC fund API',
    resolve: (_root, _args, context: GraphQLContext) => {
      requireAdmin(context);
      return systemService.getSystemStatus();
    },
  }),
);
