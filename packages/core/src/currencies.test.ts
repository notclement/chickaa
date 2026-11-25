import { describe, expect, it } from 'vitest';
import { CURRENCIES, CURRENCY_CODES, currencyDecimals, isCurrencyCode } from './currencies.ts';

describe('currencies', () => {
  it('includes every base currency named in the spec', () => {
    for (const c of ['SGD', 'MYR', 'USD', 'THB', 'JPY', 'EUR', 'IDR', 'CNY']) {
      expect(isCurrencyCode(c)).toBe(true);
    }
  });

  it('uses 0 decimals for zero-minor-unit currencies', () => {
    expect(currencyDecimals('JPY')).toBe(0);
    expect(currencyDecimals('IDR')).toBe(0);
    expect(currencyDecimals('SGD')).toBe(2);
  });

  it('only uses 3-letter upper-case codes', () => {
    for (const code of CURRENCY_CODES) expect(code).toMatch(/^[A-Z]{3}$/);
    expect(Object.keys(CURRENCIES).length).toBe(CURRENCY_CODES.length);
  });

  it('rejects unknown codes', () => {
    expect(isCurrencyCode('XXX')).toBe(false);
    expect(isCurrencyCode('toString')).toBe(false);
  });
});
