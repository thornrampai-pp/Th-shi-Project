import { describe, it, expect } from 'vitest';
import { GeminiRequestError, geminiModelChain, shouldTryNextModel } from './gemini.util';

describe('shouldTryNextModel', () => {
  it('moves on when the model is overloaded or out of quota', () => {
    expect(shouldTryNextModel(new GeminiRequestError('overloaded', true, 503))).toBe(true);
    expect(shouldTryNextModel(new GeminiRequestError('server error', true, 500))).toBe(true);
    expect(shouldTryNextModel(new GeminiRequestError('quota', true, 429))).toBe(true);
  });

  it('stops on errors another model would hit too', () => {
    expect(shouldTryNextModel(new GeminiRequestError('bad key', false, 403))).toBe(false);
    expect(shouldTryNextModel(new GeminiRequestError('bad request', false, 400))).toBe(false);
    expect(shouldTryNextModel(new Error('Gemini returned no readable content'))).toBe(false);
    expect(shouldTryNextModel(new GeminiRequestError('no status', true))).toBe(false);
  });
});

describe('geminiModelChain', () => {
  it('puts the primary model first, then the fallbacks in order', () => {
    expect(geminiModelChain('a', ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('drops repeats, including a fallback equal to the primary', () => {
    expect(geminiModelChain('a', ['a', 'b', 'b'])).toEqual(['a', 'b']);
  });

  it('is just the primary without fallbacks', () => {
    expect(geminiModelChain('a', [])).toEqual(['a']);
  });
});
