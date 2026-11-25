import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { convert, FinanceError, parseRate, rateToString, roundHalfEven } from '../index.ts';

describe('roundHalfEven (banker’s rounding)', () => {
  it.each([
    [5n, 2n, 2n], // 2.5 → 2
    [7n, 2n, 4n], // 3.5 → 4
    [11n, 4n, 3n], // 2.75 → 3
    [9n, 4n, 2n], // 2.25 → 2
    [10n, 4n, 2n], // 2.5 → 2
    [14n, 4n, 4n], // 3.5 → 4
    [0n, 3n, 0n],
    [6n, 3n, 2n],
  ])('%s/%s → %s', (n, d, out) => expect(roundHalfEven(n, d)).toBe(out));
});

describe('parseRate', () => {
  it('keeps the exact decimal', () => {
    expect(rateToString(parseRate('0.037512'))).toBe('0.037512');
    expect(rateToString(parseRate('1'))).toBe('1');
    expect(rateToString(parseRate('110.50'))).toBe('110.5');
    expect(rateToString(parseRate('0.000084210000'))).toBe('0.00008421');
  });

  it.each(['0', '-1', '', 'abc', '1e-5', '0.0000000000001', '1234567890123'])('rejects %j', (r) => {
    expect(() => parseRate(r)).toThrow(FinanceError);
  });
});

describe('convert: original currency → trip base currency', () => {
  it('THB → SGD (2 → 2 decimals)', () => {
    // 12,000 THB at 0.0375 = 450.00 SGD
    expect(convert(1_200_000n, 'THB', 'SGD', parseRate('0.0375'))).toBe(45_000n);
  });

  it('JPY → SGD (0 → 2 decimals)', () => {
    // 8,000 JPY at 0.0089 = 71.20 SGD
    expect(convert(8_000n, 'JPY', 'SGD', parseRate('0.0089'))).toBe(7_120n);
  });

  it('SGD → IDR (2 → 0 decimals)', () => {
    // 30.00 SGD at 12,000 = 360,000 IDR
    expect(convert(3_000n, 'SGD', 'IDR', parseRate('12000'))).toBe(360_000n);
  });

  it('IDR → SGD with rounding', () => {
    // 1,500,000 IDR at 0.0000845 = 126.75 SGD exactly
    expect(convert(1_500_000n, 'IDR', 'SGD', parseRate('0.0000845'))).toBe(12_675n);
    // 333 IDR at 0.0000845 = 0.0281385 SGD → 0.03
    expect(convert(333n, 'IDR', 'SGD', parseRate('0.0000845'))).toBe(3n);
  });

  it('rounds half to even at exactly half a cent', () => {
    // 1.00 USD at 1.345 = 1.345 SGD → 1.34 (4 is even); at 1.355 → 1.36
    expect(convert(100n, 'USD', 'SGD', parseRate('1.345'))).toBe(134n);
    expect(convert(100n, 'USD', 'SGD', parseRate('1.355'))).toBe(136n);
  });

  it('same currency at rate 1 is the identity', () => {
    fc.assert(fc.property(fc.bigInt({ min: 0n, max: 10n ** 13n }), (m) => {
      expect(convert(m, 'SGD', 'SGD', parseRate('1'))).toBe(m);
    }));
  });

  it('is monotonic: paying more never converts to less', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 10n }), fc.bigInt({ min: 0n, max: 10n ** 6n }), (a, extra) => {
        const r = parseRate('0.0000845');
        expect(convert(a + extra, 'IDR', 'SGD', r) >= convert(a, 'IDR', 'SGD', r)).toBe(true);
      }),
    );
  });
});
