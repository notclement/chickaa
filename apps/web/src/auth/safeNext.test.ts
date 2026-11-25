import { describe, expect, it } from 'vitest';
import { safeNext } from './safeNext.ts';

describe('safeNext', () => {
  it('keeps in-app paths', () => expect(safeNext('/join/abc')).toBe('/join/abc'));
  it('rejects open redirects', () => {
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext('/\\evil.com')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});
