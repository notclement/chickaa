/**
 * Supported currencies and their minor-unit decimals.
 *
 * Decimals follow ISO 4217 except where everyday use differs (IDR is
 * treated as 0 decimals because nobody pays in sen). See ARCHITECTURE.md §0.
 * The financial engine (Phase 3) stores every amount as an integer count
 * of these minor units.
 */
export const CURRENCIES = {
  SGD: { name: 'Singapore dollar', decimals: 2, symbol: 'S$' },
  MYR: { name: 'Malaysian ringgit', decimals: 2, symbol: 'RM' },
  USD: { name: 'US dollar', decimals: 2, symbol: 'US$' },
  EUR: { name: 'Euro', decimals: 2, symbol: '€' },
  GBP: { name: 'British pound', decimals: 2, symbol: '£' },
  AUD: { name: 'Australian dollar', decimals: 2, symbol: 'A$' },
  NZD: { name: 'New Zealand dollar', decimals: 2, symbol: 'NZ$' },
  HKD: { name: 'Hong Kong dollar', decimals: 2, symbol: 'HK$' },
  TWD: { name: 'New Taiwan dollar', decimals: 0, symbol: 'NT$' },
  CNY: { name: 'Chinese yuan', decimals: 2, symbol: 'CN¥' },
  THB: { name: 'Thai baht', decimals: 2, symbol: '฿' },
  PHP: { name: 'Philippine peso', decimals: 2, symbol: '₱' },
  INR: { name: 'Indian rupee', decimals: 2, symbol: '₹' },
  JPY: { name: 'Japanese yen', decimals: 0, symbol: '¥' },
  KRW: { name: 'South Korean won', decimals: 0, symbol: '₩' },
  IDR: { name: 'Indonesian rupiah', decimals: 0, symbol: 'Rp' },
  VND: { name: 'Vietnamese dong', decimals: 0, symbol: '₫' },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export function isCurrencyCode(code: string): code is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code);
}

export function currencyDecimals(code: CurrencyCode): number {
  return CURRENCIES[code].decimals;
}
