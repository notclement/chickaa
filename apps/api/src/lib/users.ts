import type { User } from '@ncc/contracts';
import { randomInt } from 'node:crypto';

/** The user columns every "who am I" response needs. */
export interface UserRow {
  id: string;
  username: string;
  displayName: string;
  avatarVersion: number | null;
  isAdmin: boolean;
  supporterUntil: Date | null;
  supporterLifetime: boolean;
}

export function supporterOf(u: Pick<UserRow, 'supporterUntil' | 'supporterLifetime'>, now = new Date()): User['supporter'] {
  return {
    active: u.supporterLifetime || (!!u.supporterUntil && u.supporterUntil > now),
    lifetime: u.supporterLifetime,
    until: u.supporterUntil?.toISOString() ?? null,
  };
}

export const publicUser = (u: UserRow): User => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  avatarVersion: u.avatarVersion,
  isAdmin: u.isAdmin,
  supporter: supporterOf(u),
});

/** No 0/O, 1/I/L: easy to read out loud. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newReferralCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** Referral months stop stacking beyond this far ahead (keeps fake-account farming pointless). */
export const REFERRAL_CAP_MONTHS = 12;
