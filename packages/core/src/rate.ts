/**
 * Exchange rates as exact decimals: value = num / 10^scale.
 * A rate means "1 unit of the expense currency = rate units of the base currency"
 * (e.g. THB→SGD 0.0375). Stored as NUMERIC(24,12) in Postgres.
 */
import { currencyDecimals, type CurrencyCode } from './currencies.ts';
import { FinanceError } from './errors.ts';

export interface Rate {
  readonly num: bigint;
  readonly scale: number;
}

const MAX_SCALE = 12;
const MAX_INT_DIGITS = 12;

export function parseRate(input: string): Rate {
  const s = input.trim();
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!s || !m || (!m[1] && !m[2])) throw new FinanceError('INVALID_RATE', 'Enter an exchange rate like 0.0375');
  const intPart = (m[1] ?? '').replace(/^0+(?=\d)/, '');
  const frac = (m[2] ?? '').replace(/0+$/, '');
  if (frac.length > MAX_SCALE) throw new FinanceError('INVALID_RATE', `Exchange rates can have at most ${MAX_SCALE} decimal places`);
  if (intPart.replace(/^0+/, '').length > MAX_INT_DIGITS) throw new FinanceError('INVALID_RATE', 'That exchange rate is too large');
  const num = BigInt((intPart || '0') + frac);
  if (num <= 0n) throw new FinanceError('INVALID_RATE', 'The exchange rate must be more than 0');
  return { num, scale: frac.length };
}

/** Canonical string (no trailing zeros): what we store and show. */
export function rateToString(r: Rate): string {
  const s = r.num.toString().padStart(r.scale + 1, '0');
  if (r.scale === 0) return s;
  const whole = s.slice(0, s.length - r.scale);
  const frac = s.slice(s.length - r.scale).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

export const ONE: Rate = { num: 1n, scale: 0 };

export function isOne(r: Rate): boolean {
  return r.num === 10n ** BigInt(r.scale);
}

/** n / d rounded to the nearest integer, ties to even (banker's rounding). n ≥ 0, d > 0. */
export function roundHalfEven(n: bigint, d: bigint): bigint {
  if (d <= 0n || n < 0n) throw new RangeError('roundHalfEven expects n ≥ 0 and d > 0');
  const q = n / d;
  const r2 = (n % d) * 2n;
  if (r2 > d) return q + 1n;
  if (r2 < d) return q;
  return q % 2n === 0n ? q : q + 1n;
}

/** Converts minor units of `from` into minor units of `to` using an exact rate. */
export function convert(minor: bigint, from: CurrencyCode, to: CurrencyCode, rate: Rate): bigint {
  const shift = currencyDecimals(to) - currencyDecimals(from);
  let n = minor * rate.num;
  let d = 10n ** BigInt(rate.scale);
  if (shift >= 0) n *= 10n ** BigInt(shift);
  else d *= 10n ** BigInt(-shift);
  return roundHalfEven(n, d);
}

/**
 * Exact rate from a numeric literal as it appears in an API's JSON text ("8.45e-5", "0.037512"),
 * so provider rates never pass through a float. Rounded half-even to 12 decimal places.
 */
export function rateFromLiteral(literal: string): Rate {
  const m = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(literal.trim());
  if (!m) throw new FinanceError('INVALID_RATE', `Unreadable exchange rate “${literal}”`);
  const digits = BigInt(m[1]! + (m[2] ?? ''));
  // value = digits × 10^(exp − fracLen)
  let exp = Number.parseInt(m[3] ?? '0', 10) - (m[2] ?? '').length;
  let num = digits;
  if (exp >= 0) {
    num *= 10n ** BigInt(exp);
    exp = 0;
  }
  let scale = -exp;
  if (scale > MAX_SCALE) {
    num = roundHalfEven(num, 10n ** BigInt(scale - MAX_SCALE));
    scale = MAX_SCALE;
  }
  if (num <= 0n) throw new FinanceError('INVALID_RATE', 'The exchange rate must be more than 0');
  return parseRate(rateToString({ num, scale }));
}
