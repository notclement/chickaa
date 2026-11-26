/**
 * Reserved user IDs. "admin" is the one real admin account (created with a one-time code), and
 * nobody may pick an ID that looks like an admin/staff account: leetspeak (adm1n, 4dmin), separators
 * (a_d.m-i_n), doubled letters (aadmmin), one-letter typos and swaps (admn, amdin, admim), and
 * words like administrator, root, sysadmin, moderator, support, official, chickaa.
 */
export const ADMIN_USERNAME = 'admin';

/** Words that may not appear anywhere in an ID. */
const BLOCKED_ANYWHERE = [
  'admin', 'administrator', 'sysadmin', 'superuser', 'superadmin', 'webmaster', 'hostmaster', 'postmaster',
  'moderator', 'helpdesk', 'chickaa', 'official', 'customerservice',
];
/** Words that may not be the whole ID or start/end it (too short to ban everywhere). */
const BLOCKED_EDGES = ['adm', 'admn', 'root', 'sudo', 'sysop', 'system', 'mod', 'mods', 'staff', 'support', 'owner', 'chickaa', 'team', 'security', 'operator', 'sys'];
/** Real words that happen to contain "admin". */
const ALLOWED_WORDS = ['badminton'];

const LEET: Record<string, string> = { '0': 'o', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b', '9': 'g', '2': 'z', '6': 'g', '!': 'i', '|': 'l' };

/** Every plausible reading of an ID: 1 as i or l, digits as letters or dropped, separators gone, repeats collapsed. */
function readings(id: string): string[] {
  const base = id.toLowerCase().replace(/[\s._\-]/g, '');
  const out = new Set<string>();
  for (const one of ['i', 'l']) {
    const mapped = [...base].map((ch) => (ch === '1' ? one : (LEET[ch] ?? ch))).join('');
    out.add(mapped);
    out.add(base.replace(/[^a-z]/g, ''));
  }
  const collapsed = [...out].map((s) => s.replace(/(.)\1+/g, '$1'));
  for (const c of collapsed) out.add(c);
  return [...out].filter(Boolean);
}

/** Optimal-string-alignment distance (edits + adjacent swaps), capped for speed. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/** True if a NEW user may not take this ID. (The real "admin" account is created separately.) */
export function isReservedUsername(id: string): boolean {
  for (const r of readings(id)) {
    let s = r;
    for (const ok of ALLOWED_WORDS) s = s.replaceAll(ok, '#');
    if (BLOCKED_ANYWHERE.some((w) => s.includes(w))) return true;
    if (BLOCKED_EDGES.some((w) => s === w || s.startsWith(w) || s.endsWith(w))) return true;
    // One-letter typos/swaps of "admin" anywhere inside (admn, amdin, admim, addmin, sdmin…).
    for (let len = 4; len <= 6; len++) {
      for (let i = 0; i + len <= s.length; i++) if (distance(s.slice(i, i + len), 'admin') <= 1) return true;
    }
  }
  return false;
}
