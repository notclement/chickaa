import { describe, expect, it } from 'vitest';
import { buildExpense, computeSplit, FinanceError, isOne, ONE, parseRate, rateToString, roundHalfEven, sumMinor } from '../index.ts';

describe('edge cases', () => {
  it('sumMinor', () => expect(sumMinor([1n, 2n, 3n])).toBe(6n));

  it('rate helpers', () => {
    expect(isOne(ONE)).toBe(true);
    expect(isOne(parseRate('1.000'))).toBe(true);
    expect(isOne(parseRate('0.5'))).toBe(false);
    expect(rateToString(parseRate('007'))).toBe('7');
    expect(rateToString(parseRate('.5'))).toBe('0.5');
    expect(rateToString(parseRate('12.'))).toBe('12');
    expect(() => parseRate('.')).toThrow(FinanceError);
    expect(() => roundHalfEven(1n, 0n)).toThrow(RangeError);
    expect(() => roundHalfEven(-1n, 2n)).toThrow(RangeError);
  });

  it('expense total must be positive; overpaying is reported', () => {
    const base = { currency: 'SGD' as const, baseCurrency: 'SGD' as const, rate: '1', split: { type: 'equal' as const, participants: ['a'] } };
    expect(() => buildExpense({ ...base, total: 0n, payers: [{ userId: 'a', amount: 1n }] })).toThrow(/more than 0/);
    expect(() => buildExpense({ ...base, total: 100n, payers: [{ userId: 'a', amount: 101n }] })).toThrow(/more than the total/);
  });

  it('exact split that adds up to more than the total', () => {
    expect(() => computeSplit(100n, { type: 'exact', amounts: [{ userId: 'a', amount: 101n }] })).toThrow(/more than the total/);
  });

  it('percentage out of range', () => {
    expect(() => computeSplit(100n, { type: 'percentage', percents: [{ userId: 'a', basisPoints: 0 }] })).toThrow(FinanceError);
    expect(() => computeSplit(100n, { type: 'percentage', percents: [{ userId: 'a', basisPoints: 10001 }] })).toThrow(FinanceError);
  });
});
