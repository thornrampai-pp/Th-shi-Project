import { redis } from '../../config/redis';

export const CACHE_TTL = {
  QUOTE: 60 * 3, // 3 min — live-ish price
  EOD_SYNC_LOCK: 60 * 60 * 24, // 24h — one EOD pull per asset per day
  FUNDAMENTAL: 60 * 60 * 24 * 7, // 7 days
} as const;

export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached) as T;
  }

  const value = await fetcher();
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  return value;
}

export async function acquireOnceLock(key: string, ttlSeconds: number): Promise<boolean> {
  const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}
