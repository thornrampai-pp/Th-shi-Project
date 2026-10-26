import { describe, it, expect } from 'vitest';
import { computeUsage, formatBytes, highestReachedThreshold } from './storage-usage';

const GB = 1024 ** 3;

describe('computeUsage', () => {
  it('computes percent of quota', () => {
    expect(computeUsage(8 * GB, 10 * GB).percent).toBe(80);
  });

  it('is 0% for a zero quota instead of dividing by zero', () => {
    expect(computeUsage(5, 0).percent).toBe(0);
  });
});

describe('highestReachedThreshold', () => {
  const thresholds = [80, 90, 100];

  it.each([
    [0, null],
    [79.99, null],
    [80, 80],
    [85, 80],
    [90, 90],
    [99.9, 90],
    [100, 100],
    [130, 100],
  ])('%d%% → %s', (percent, expected) => {
    expect(highestReachedThreshold(percent, thresholds)).toBe(expected);
  });

  it('works with unsorted thresholds', () => {
    expect(highestReachedThreshold(95, [100, 80, 90])).toBe(90);
  });

  it('returns null with no thresholds', () => {
    expect(highestReachedThreshold(100, [])).toBeNull();
  });
});

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [1536, '1.50 KB'],
    [8 * GB, '8.00 GB'],
  ])('%d → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
