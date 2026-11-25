import { describe, expect, it } from 'vitest';
import { extractInviteToken, formatDateRange } from './format.ts';

describe('extractInviteToken', () => {
  const token = 'Ab3_-xYz0123456789abcdEFGH';
  it('reads a full link, with or without extra text around it', () => {
    expect(extractInviteToken(`https://nochickencall.onrender.com/join/${token}`)).toBe(token);
    expect(extractInviteToken(`Join our trip! https://x.app/join/${token} 🐣`)).toBe(token);
  });
  it('accepts a bare token and rejects junk', () => {
    expect(extractInviteToken(token)).toBe(token);
    expect(extractInviteToken('hello')).toBeNull();
    expect(extractInviteToken('https://example.com/trips/123')).toBeNull();
  });
});

describe('formatDateRange', () => {
  it('handles missing dates', () => {
    expect(formatDateRange(null, null)).toBeNull();
    expect(formatDateRange('2027-03-01', null)).toMatch(/2027/);
  });
  it('formats a same-year range compactly', () => {
    const s = formatDateRange('2027-03-01', '2027-03-07')!;
    expect(s).toContain('–');
    expect(s.match(/2027/g)).toHaveLength(1);
  });
});
