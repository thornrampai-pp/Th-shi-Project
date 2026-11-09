import { describe, it, expect } from 'vitest';
import {
  discordInteractionLabel,
  geminiModelCounts,
  geminiModelUsage,
  geminiQuotaDay,
  geminiRecentMember,
  keyGroup,
  parseRedisInfo,
  recentGeminiQuotaDays,
  tokensFromRecentMember,
  totalKeyspace,
} from './metrics-keys';

describe('geminiModelCounts', () => {
  it('reads per-model call counts out of a day hash, ignoring the other fields', () => {
    const fields = { requests: '9', 'model:a': '6', 'model:b': '3', 'modelErrors:a': '5', errors: '5' };
    expect(geminiModelCounts(fields)).toEqual({ a: 6, b: 3 });
  });
});

describe('geminiModelUsage', () => {
  const fields = { 'model:primary': '9', 'modelErrors:primary': '7', 'model:old': '2', 'model:fallback': '1' };

  it('lists the configured chain first, in order, with each model held to the per-model limit', () => {
    const usage = geminiModelUsage(['primary', 'fallback'], fields, 15);
    expect(usage.slice(0, 2)).toEqual([
      { model: 'primary', requests: 9, errors: 7, limit: 15, inChain: true },
      { model: 'fallback', requests: 1, errors: 0, limit: 15, inChain: true },
    ]);
  });

  it('still shows models called today that are no longer in the chain', () => {
    const usage = geminiModelUsage(['primary', 'fallback'], fields, 15);
    expect(usage[2]).toEqual({ model: 'old', requests: 2, errors: 0, limit: 15, inChain: false });
  });

  it('shows a chain model with no calls yet as zero, and no limit when none is set', () => {
    expect(geminiModelUsage(['fresh'], {}, null)).toEqual([
      { model: 'fresh', requests: 0, errors: 0, limit: null, inChain: true },
    ]);
  });
});

describe('keyGroup', () => {
  it('uses the first segment for two-part keys', () => {
    expect(keyGroup('quote:AAPL')).toBe('quote');
    expect(keyGroup('revoked_jti:abc-123')).toBe('revoked_jti');
  });

  it('keeps a word-like second segment as a sub-namespace', () => {
    expect(keyGroup('history:price-tail:6f1c2a9e-1111-4c3b:2026-11-05')).toBe('history:price-tail');
    expect(keyGroup('sys:gemini:day:2026-11-05')).toBe('sys:gemini');
  });

  it('does not let an id become a group', () => {
    expect(keyGroup('storage-alert:r2:80')).toBe('storage-alert:r2');
    expect(keyGroup('order-fill-lock:9f8e7d')).toBe('order-fill-lock');
    expect(keyGroup('x:123:y')).toBe('x');
  });

  it('returns the whole key when there is no namespace', () => {
    expect(keyGroup('plainkey')).toBe('plainkey');
  });
});

describe('geminiQuotaDay', () => {
  it('counts days in Pacific time', () => {
    // 05:00 UTC on Nov 5 is still Nov 4 in Los Angeles.
    expect(geminiQuotaDay(new Date('2026-11-05T05:00:00Z'))).toBe('2026-11-04');
    expect(geminiQuotaDay(new Date('2026-11-05T09:00:00Z'))).toBe('2026-11-05');
  });

  it('lists recent days newest first without duplicates', () => {
    expect(recentGeminiQuotaDays(3, new Date('2026-11-05T20:00:00Z'))).toEqual([
      '2026-11-05',
      '2026-11-04',
      '2026-11-03',
    ]);
  });
});

describe('gemini recent members', () => {
  it('round-trips the token count', () => {
    expect(tokensFromRecentMember(geminiRecentMember(Date.now(), 1234))).toBe(1234);
  });

  it('is unique for calls in the same millisecond', () => {
    expect(geminiRecentMember(1, 5)).not.toBe(geminiRecentMember(1, 5));
  });

  it('treats a malformed member as zero tokens', () => {
    expect(tokensFromRecentMember('garbage')).toBe(0);
  });
});

describe('parseRedisInfo / totalKeyspace', () => {
  const info = [
    '# Server',
    'redis_version:7.2.4',
    'uptime_in_seconds:3600',
    '',
    '# Keyspace',
    'db0:keys=10,expires=4,avg_ttl=1000',
    'db1:keys=5,expires=1,avg_ttl=0',
  ].join('\r\n');

  it('flattens fields and drops section headers', () => {
    const fields = parseRedisInfo(info);
    expect(fields.redis_version).toBe('7.2.4');
    expect(fields.uptime_in_seconds).toBe('3600');
    expect(fields['# Server']).toBeUndefined();
  });

  it('sums keys across databases', () => {
    expect(totalKeyspace(parseRedisInfo(info))).toEqual({ keys: 15, expires: 5 });
  });
});

describe('discordInteractionLabel', () => {
  it('names slash commands and autocomplete by command', () => {
    expect(discordInteractionLabel(2, 'upload-slip')).toBe('/upload-slip');
    expect(discordInteractionLabel(4, 'upload-slip')).toBe('autocomplete /upload-slip');
  });

  it('labels the other interaction types', () => {
    expect(discordInteractionLabel(1, undefined)).toBe('ping');
    expect(discordInteractionLabel(3, undefined)).toBe('component');
    expect(discordInteractionLabel(5, undefined)).toBe('modal');
    expect(discordInteractionLabel(9, undefined)).toBe('type 9');
  });
});
