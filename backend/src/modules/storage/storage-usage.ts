/**
 * Pure decision logic for the storage-usage alert — no I/O, unit tested.
 */

export interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
  /** usedBytes / quotaBytes × 100 */
  percent: number;
}

export function computeUsage(usedBytes: number, quotaBytes: number): StorageUsage {
  return { usedBytes, quotaBytes, percent: quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0 };
}

/**
 * Highest alert threshold (in %) that usage has reached, or null if below all of them.
 * Only the highest is reported, so crossing 80% and 90% in one day sends one message.
 */
export function highestReachedThreshold(percent: number, thresholds: number[]): number | null {
  const reached = thresholds.filter((t) => percent >= t);
  return reached.length > 0 ? Math.max(...reached) : null;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(2)} ${units[unit]}`;
}
