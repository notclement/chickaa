import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatAmount, FinanceError, parseAmount } from '../index.ts';

describe('parseAmount: user input → exact integer minor units', () => {
  it.each([
    ['12.34', 'SGD', 1234n],
    ['12.3', 'SGD', 1230n],
    ['12', 'SGD', 1200n],
    ['0.01', 'SGD', 1n],
    ['.5', 'SGD', 50n],
    ['1,234.56', 'USD', 123456n],
    [' 1 234,5 '.replace(',', '.'), 'EUR', 123450n],
    ['8000', 'JPY', 8000n],
    ['1,500,000', 'IDR', 1500000n],
    ['0.10', 'THB', 10n],
    ['99999999999.99', 'SGD', 9999999999999n],
  ])('%s %s → %s', (input, cur, expected) => {
    expect(parseAmount(input, cur as 'SGD')).toBe(expected);
  });

  it('never goes through floating point (0.1 + 0.2 style traps)', () => {
    expect(parseAmount('0.29', 'SGD')).toBe(29n); // 0.29 * 100 = 28.999999999999996 in floats
    expect(parseAmount('1.15', 'SGD')).toBe(115n);
    expect(parseAmount('4.35', 'SGD')).toBe(435n);
  });

  it.each([
    ['', 'empty'],
    ['abc', 'not a number'],
    ['-5', 'negative'],
    ['1e3', 'scientific'],
    ['12.345', 'too many decimals for SGD'],
    ['1.2.3', 'two dots'],
    ['1,23,4', 'bad grouping'],
  ])('rejects %j (%s)', (input) => {
    expect(() => parseAmount(input, 'SGD')).toThrow(FinanceError);
  });

  it('rejects decimals for zero-decimal currencies', () => {
    expect(() => parseAmount('100.5', 'JPY')).toThrow(/decimal/i);
    expect(parseAmount('100.', 'JPY')).toBe(100n);
  });

  it('rejects absurdly large amounts', () => {
    expect(() => parseAmount('1000000000000000', 'SGD')).toThrow(FinanceError);
  });
});

describe('formatAmount', () => {
  it.each([
    [1234n, 'SGD', '12.34'],
    [5n, 'SGD', '0.05'],
    [123456789n, 'USD', '1,234,567.89'],
    [8000n, 'JPY', '8,000'],
    [-1050n, 'SGD', '-10.50'],
    [0n, 'IDR', '0'],
  ])('%s %s → %s', (minor, cur, out) => {
    expect(formatAmount(minor, cur as 'SGD')).toBe(out);
  });

  it('round-trips with parseAmount for every amount', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 13n }), fc.constantFrom('SGD', 'JPY', 'IDR', 'USD'), (minor, cur) => {
        expect(parseAmount(formatAmount(minor, cur), cur)).toBe(minor);
      }),
    );
  });
});
