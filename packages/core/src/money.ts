/**
 * Money is always an integer count of minor units (cents, sen…) held in a bigint.
 * Parsing and formatting work on the decimal string directly: no floating point anywhere.
 */
import { currencyDecimals, type CurrencyCode } from './currencies.ts';
import { FinanceError } from './errors.ts';

/** Largest amount we accept in one expense: 10^13 minor units (100 billion SGD). */
export const MAX_MINOR = 10n ** 13n;

const pow10 = (n: number) => 10n ** BigInt(n);

/**
 * "1,234.50" → 123450n for SGD. Accepts optional thousands separators (commas or spaces),
 * a leading or trailing dot. Rejects negatives, exponents and more decimals than the currency has.
 */
export function parseAmount(input: string, currency: CurrencyCode): bigint {
  const decimals = currencyDecimals(currency);
  const s = input.trim().replace(/\s/g, '');
  if (!s) throw new FinanceError('INVALID_AMOUNT', 'Enter an amount');
  const m = /^(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === '' && !m[2])) throw new FinanceError('INVALID_AMOUNT', 'Enter a number like 12.50');
  const whole = (m[1] ?? '').replaceAll(',', '') || '0';
  const frac = m[2] ?? '';
  if (frac.length > decimals) {
    throw new FinanceError(
      'INVALID_AMOUNT',
      decimals === 0 ? `${currency} amounts can’t have a decimal part` : `${currency} amounts have at most ${decimals} decimal places`,
    );
  }
  const minor = BigInt(whole) * pow10(decimals) + BigInt((frac || '0').padEnd(decimals, '0').slice(0, decimals) || '0');
  if (minor > MAX_MINOR) throw new FinanceError('INVALID_AMOUNT', 'That amount is too large');
  return minor;
}

/** 123456n SGD → "1,234.56". No currency symbol (the UI adds that). */
export function formatAmount(minor: bigint, currency: CurrencyCode): string {
  const decimals = currencyDecimals(currency);
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const unit = pow10(decimals);
  const whole = (abs / unit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = decimals ? '.' + (abs % unit).toString().padStart(decimals, '0') : '';
  return `${neg ? '-' : ''}${whole}${frac}`;
}

export function sumMinor(values: Iterable<bigint>): bigint {
  let s = 0n;
  for (const v of values) s += v;
  return s;
}
