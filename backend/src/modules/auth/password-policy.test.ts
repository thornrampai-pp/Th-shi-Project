import { describe, it, expect } from 'vitest';
import { assertPasswordPolicy } from './password-policy';

describe('assertPasswordPolicy', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(() => assertPasswordPolicy('1234567')).toThrow(/at least 8/);
    expect(() => assertPasswordPolicy('')).toThrow(/at least 8/);
  });

  it('accepts 8 characters and more', () => {
    expect(() => assertPasswordPolicy('12345678')).not.toThrow();
    expect(() => assertPasswordPolicy('correct horse battery staple')).not.toThrow();
  });

  it('counts characters, not bytes, for the minimum (Thai is 3 bytes per char)', () => {
    expect(() => assertPasswordPolicy('รหัสผ่าน')).not.toThrow(); // 8 chars
    expect(() => assertPasswordPolicy('รหัสผ่')).toThrow(/at least 8/); // 6 chars, 18 bytes
  });

  it('rejects passwords bcrypt would truncate (over 72 bytes)', () => {
    expect(() => assertPasswordPolicy('a'.repeat(72))).not.toThrow();
    expect(() => assertPasswordPolicy('a'.repeat(73))).toThrow(/too long/);
    expect(() => assertPasswordPolicy('ก'.repeat(25))).toThrow(/too long/); // 75 bytes
  });
});
