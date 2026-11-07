/**
 * Integration tests write real Redis keys (pending statements, cached Gemini reads,
 * locks). They get their own logical database so none of it lands in the dev data:
 * TEST_REDIS_URL if set, else REDIS_URL with database 15.
 */
export const TEST_REDIS_DB = 15;

export function testRedisUrl(devUrl: string, explicit?: string): string {
  if (explicit) return explicit;
  const url = new URL(devUrl);
  url.pathname = `/${TEST_REDIS_DB}`;
  return url.toString();
}

/** True when `testUrl` points somewhere other than the dev database — safe to flush. */
export function isSeparateFromDev(testUrl: string, devUrl: string): boolean {
  const db = (u: URL) => u.pathname.replace('/', '') || '0';
  const a = new URL(testUrl);
  const b = new URL(devUrl);
  return a.host !== b.host || db(a) !== db(b);
}
