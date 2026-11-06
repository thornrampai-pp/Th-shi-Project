import Redis from 'ioredis';
import { env } from './env';
import { recordRedisEvent } from '../common/monitoring/redis-events';

export const redis = new Redis(env.REDIS_URL);

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
  recordRedisEvent('error', err.message);
});
redis.on('connect', () => recordRedisEvent('connect'));
redis.on('ready', () => recordRedisEvent('ready'));
redis.on('reconnecting', (delayMs: number) => recordRedisEvent('reconnecting', `retry in ${delayMs}ms`));
redis.on('end', () => recordRedisEvent('end'));
