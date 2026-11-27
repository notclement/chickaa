import { describe, expect, it } from 'vitest';
import { tripTag } from '../index.ts';

const today = '2027-03-10';
const t = (o: Partial<{ status: string; deletedAt: string | null; startDate: string | null; endDate: string | null }> = {}) => ({
  status: 'active',
  deletedAt: null,
  startDate: null,
  endDate: null,
  ...o,
});
const none = { expenseCount: 0, openTransfers: 0 };

describe('tripTag', () => {
  it.each([
    [t({ deletedAt: '2027-03-01' }), none, 'deleted'],
    [t({ status: 'completed' }), none, 'ended'],
    [t({ status: 'completed' }), { expenseCount: 3, openTransfers: 1 }, 'pending_settlement'],
    [t({ endDate: '2027-03-09' }), none, 'needs_finishing'],
    [t({ startDate: '2027-03-08', endDate: '2027-03-12' }), none, 'ongoing'],
    [t({ startDate: '2027-03-08' }), none, 'ongoing'],
    [t({ startDate: '2027-04-01' }), { expenseCount: 1, openTransfers: 0 }, 'ongoing'],
    [t({ startDate: '2027-04-01' }), none, 'active'],
    [t(), none, 'active'],
  ] as const)('%o → %s', (trip, stats, tag) => expect(tripTag(trip, stats, today)).toBe(tag));
});
