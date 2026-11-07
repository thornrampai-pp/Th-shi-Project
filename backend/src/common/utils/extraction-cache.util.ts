import { createHash } from 'crypto';
import { redis } from '../../config/redis';
import { recordCacheAccess } from '../monitoring/usage-metrics';

/**
 * Gemini reads of uploaded documents, keyed by the files' sha256. Uploading the same
 * statement or slip again (to retry rows that failed, or by accident) reuses the
 * earlier read instead of spending another Gemini call — the daily quota is small.
 * Rows already recorded are still skipped by their order number, so reusing a read
 * never records anything twice.
 *
 * Content-addressed: identical bytes always read the same, so the key needs no user.
 */

const TTL_SECONDS = 30 * 24 * 3600;

export function sha256Hex(...parts: Buffer[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    // Length-prefix each file so [ab, c] and [a, bc] never hash alike.
    hash.update(String(part.length)).update(':').update(part);
  }
  return hash.digest('hex');
}

export function extractionCacheKey(kind: 'statement' | 'slips', hash: string): string {
  return `gemini-extract:${kind}:${hash}`;
}

/**
 * Returns the cached read for these files, or runs `extract` and caches its result
 * when `worthCaching` says so (e.g. not an empty read, which a fallback model might
 * do better on). A Redis failure only costs the cache, never the upload.
 */
export async function withExtractionCache<T>(
  kind: 'statement' | 'slips',
  files: Buffer[],
  extract: () => Promise<T>,
  worthCaching: (result: T) => boolean = () => true,
): Promise<T> {
  const key = extractionCacheKey(kind, sha256Hex(...files));
  const startedAt = performance.now();

  const cached = await redis.get(key).catch(() => null);
  if (cached) {
    try {
      const value = JSON.parse(cached) as T;
      recordCacheAccess(key, true, performance.now() - startedAt);
      return value;
    } catch {
      // Corrupt entry — fall through and read again.
    }
  }

  const result = await extract();
  if (worthCaching(result)) {
    await redis.set(key, JSON.stringify(result), 'EX', TTL_SECONDS).catch(() => {});
  }
  recordCacheAccess(key, false, performance.now() - startedAt);
  return result;
}
