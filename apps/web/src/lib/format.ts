import { CURRENCIES, isCurrencyCode } from '@ncc/core';

const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const dayYearFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** "1 – 7 Mar 2027", "1 Mar 2027 –", or null. Dates are plain YYYY-MM-DD (no timezone shifts). */
export function formatDateRange(start: string | null, end: string | null): string | null {
  const d = (s: string) => {
    const [y, m, day] = s.split('-').map(Number);
    return new Date(y!, m! - 1, day!);
  };
  if (start && end) {
    const a = d(start);
    const b = d(end);
    return a.getFullYear() === b.getFullYear() ? `${dayFmt.format(a)} – ${dayYearFmt.format(b)}` : `${dayYearFmt.format(a)} – ${dayYearFmt.format(b)}`;
  }
  if (start) return `From ${dayYearFmt.format(d(start))}`;
  if (end) return `Until ${dayYearFmt.format(d(end))}`;
  return null;
}

export function currencyLabel(code: string): string {
  return isCurrencyCode(code) ? `${code} · ${CURRENCIES[code].name}` : code;
}

export function relativeTime(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

/** Pulls an invite token out of a pasted link (or accepts a bare token). */
export function extractInviteToken(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/join\/([A-Za-z0-9_-]{16,100})/);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{16,100}$/.test(s) ? s : null;
}
