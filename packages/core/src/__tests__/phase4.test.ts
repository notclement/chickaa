import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { FinanceError, formatPercent, parsePercent, rateFromLiteral, rateToString } from '../index.ts';

describe('parsePercent: "33.33" → 3333 basis points (exact)', () => {
  it.each([
    ['50', 5000],
    ['33.33', 3333],
    ['0.01', 1],
    ['100', 10000],
    ['12.5', 1250],
    [' 7 ', 700],
  ])('%s → %s', (s, bp) => expect(parsePercent(s)).toBe(bp));

  it.each(['', 'abc', '-5', '100.01', '0', '1.234', '1e2'])('rejects %j', (s) => {
    expect(() => parsePercent(s)).toThrow(FinanceError);
  });

  it('formats back', () => {
    expect(formatPercent(3333)).toBe('33.33');
    expect(formatPercent(5000)).toBe('50');
    expect(formatPercent(1250)).toBe('12.5');
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10000 }), (bp) => {
        expect(parsePercent(formatPercent(bp))).toBe(bp);
      }),
    );
  });
});

describe('rateFromLiteral: JSON number text from an FX API → exact rate', () => {
  it.each([
    ['0.037512', '0.037512'],
    ['8.45e-5', '0.0000845'],
    ['8.45E-05', '0.0000845'],
    ['1.2345e2', '123.45'],
    ['12000', '12000'],
    ['0.0000000123456789', '0.000000012346'], // rounded half-even to 12 decimals
    ['1.0000000000005', '1'], // …ties to even
    ['1.0000000000015', '1.000000000002'],
  ])('%s → %s', (lit, out) => expect(rateToString(rateFromLiteral(lit))).toBe(out));

  it.each(['', 'NaN', '-1', '0', 'abc', '1e-20'])('rejects %j', (lit) => {
    expect(() => rateFromLiteral(lit)).toThrow(FinanceError);
  });
});
