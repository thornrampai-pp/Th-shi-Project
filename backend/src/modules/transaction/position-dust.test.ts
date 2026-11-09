import { describe, it, expect } from 'vitest';
import { POSITION_DUST_QTY, quantityRemovedBySell } from './position-dust';

describe('quantityRemovedBySell', () => {
  it('removes exactly what was sold when a real holding is left', () => {
    expect(quantityRemovedBySell(0.5456933, 0.1291177)).toBe(0.1291177);
  });

  it('closes the whole position when the sell would leave only dust', () => {
    // SMCI: 0.0134256 (statement rounded to 7dp) x 10 split = 0.134256, sold 0.1342556.
    expect(quantityRemovedBySell(0.134256, 0.1342556)).toBe(0.134256);
  });

  it('treats an exact full sell as a full sell', () => {
    expect(quantityRemovedBySell(0.6354103, 0.6354103)).toBe(0.6354103);
  });

  it('keeps a leftover at or above the dust threshold', () => {
    expect(quantityRemovedBySell(1, 1 - POSITION_DUST_QTY)).toBe(1 - POSITION_DUST_QTY);
    expect(quantityRemovedBySell(1, 0.99)).toBe(0.99);
  });

  it('does not stretch a sell beyond what is held (that is still an error elsewhere)', () => {
    expect(quantityRemovedBySell(0.1, 0.2)).toBe(0.2);
  });
});
