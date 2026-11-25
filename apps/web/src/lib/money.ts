import { CURRENCIES, formatAmount, isCurrencyCode, parseAmount, type CurrencyCode } from '@ncc/core';

/** "S$1,234.50" from minor units (bigint or the string the API sends). */
export function money(minor: bigint | string, currency: string, opts: { signed?: boolean } = {}): string {
  const v = typeof minor === 'string' ? BigInt(minor) : minor;
  if (!isCurrencyCode(currency)) return `${formatAmount(v, 'SGD')} ${currency}`;
  const abs = v < 0n ? -v : v;
  const sign = v < 0n ? '−' : opts.signed && v > 0n ? '+' : '';
  return `${sign}${CURRENCIES[currency].symbol}${formatAmount(abs, currency)}`;
}

/** Accepts "12,50" typed on keyboards that use a decimal comma. */
export function normalizeAmountInput(s: string): string {
  const t = s.trim();
  return /^\d+,\d{1,2}$/.test(t) ? t.replace(',', '.') : t;
}

/** Parses user input; returns null instead of throwing (for live previews). */
export function tryParseAmount(s: string, currency: CurrencyCode): bigint | null {
  try {
    return parseAmount(normalizeAmountInput(s), currency);
  } catch {
    return null;
  }
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
