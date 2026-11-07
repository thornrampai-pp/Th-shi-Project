import { describe, it, expect } from 'vitest';
import { isSeparateFromDev, testRedisUrl } from './redis-test-url';

describe('testRedisUrl', () => {
  it('moves the dev URL to database 15', () => {
    expect(testRedisUrl('redis://localhost:6379')).toBe('redis://localhost:6379/15');
    expect(testRedisUrl('redis://:pw@host:6380/0')).toBe('redis://:pw@host:6380/15');
  });

  it('uses TEST_REDIS_URL when given', () => {
    expect(testRedisUrl('redis://localhost:6379', 'redis://other:6379/2')).toBe('redis://other:6379/2');
  });
});

describe('isSeparateFromDev', () => {
  it('is false for the same host and database, so the dev data is never flushed', () => {
    expect(isSeparateFromDev('redis://localhost:6379', 'redis://localhost:6379/0')).toBe(false);
  });

  it('is true for another database or host', () => {
    expect(isSeparateFromDev('redis://localhost:6379/15', 'redis://localhost:6379')).toBe(true);
    expect(isSeparateFromDev('redis://other:6379', 'redis://localhost:6379')).toBe(true);
  });
});
