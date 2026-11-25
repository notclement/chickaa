import { describe, expect, it } from 'vitest';
import { money, normalizeAmountInput, tryParseAmount } from './money.ts';

describe('money display', () => {
  it('formats with symbols and signs', () => {
    expect(money('123456', 'SGD')).toBe('S$1,234.56');
    expect(money(-500n, 'SGD')).toBe('−S$5.00');
    expect(money(500n, 'SGD', { signed: true })).toBe('+S$5.00');
    expect(money('1500000', 'IDR')).toBe('Rp1,500,000');
  });
  it('accepts decimal commas', () => {
    expect(normalizeAmountInput('12,50')).toBe('12.50');
    expect(normalizeAmountInput('1,500')).toBe('1,500');
    expect(tryParseAmount('12,5', 'SGD')).toBe(1250n);
    expect(tryParseAmount('abc', 'SGD')).toBeNull();
  });
});
