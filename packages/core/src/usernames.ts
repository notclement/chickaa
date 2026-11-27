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
/**
 * Short words that are only blocked as a whole word: the entire ID, one part of it between
 * separators/digits (mod_sg, staff_ann, mod1), or joined to a role word (rootuser, teamsupport).
 * Inside ordinary words they're fine (model, rootbeer, supportive, sudoku, teamlee): test report run 3, F3.
 */
const BLOCKED_WORDS = ['adm', 'admn', 'root', 'sudo', 'sysop', 'system', 'mod', 'mods', 'staff', 'support', 'owner', 'team', 'security', 'operator', 'sys'];
const ROLE_PARTS = ['user', 'team', 'staff', 'support', 'official', 'bot', 'help', 'account', 'acct', 'service', 'app'];
/** Real names/words that happen to be one edit away from "admin" or contain it. */
const ALLOWED_WORDS = ['badminton', 'amin', 'armin'];
/** Typos of "admin" that aren't a single edit. */
const EXTRA_TYPOS = ['adnim', 'amdni', 'admni'];

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

/** Word parts of the raw ID: split on separators and digit runs ("mod_sg" → mod, sg; "mod1" → mod). */
function parts(id: string): string[] {
  return id.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

/** True if a NEW user may not take this ID. (The real "admin" account is created separately.) */
export function isReservedUsername(id: string): boolean {
  if (parts(id).some((p) => BLOCKED_WORDS.includes(p) || EXTRA_TYPOS.includes(p))) return true;
  for (const r of readings(id)) {
    if (ALLOWED_WORDS.includes(r)) continue;
    let s = r;
    for (const ok of ALLOWED_WORDS) if (ok.length > 5) s = s.replaceAll(ok, '#');
    if (BLOCKED_ANYWHERE.some((w) => s.includes(w))) return true;
    if (BLOCKED_WORDS.some((w) => s === w || ROLE_PARTS.some((x) => s === w + x || s === x + w))) return true;
    // Typos/swaps of "admin" as the whole ID (admn, amdin, admim, addmin, sdmin, adnim), not inside
    // longer words, so benjamin, jasmine and yasmin are fine.
    if (EXTRA_TYPOS.includes(s) || distance(s, 'admin') <= 1) return true;
    if (distance(s, 'administrator') <= 2 || distance(s, 'moderator') <= 1) return true;
  }
  return false;
}
