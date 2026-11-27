/** Trip status tags, shown in Admin and on the trip screen (one meaning everywhere: test report run 3, F10). */
export const TRIP_TAGS = ['active', 'ongoing', 'needs_finishing', 'pending_settlement', 'ended', 'deleted'] as const;
export type TripTagValue = (typeof TRIP_TAGS)[number];

/**
 * - deleted: deleted by the owner
 * - ended / pending settlement: finished, and all payments confirmed or not
 * - needs finishing: the end date has passed but it's still open
 * - on-going: within the trip dates, or has an expense
 * - active: created, nothing added yet (invites / before the trip)
 * `today` is YYYY-MM-DD.
 */
export function tripTag(
  t: { status: string; deletedAt?: Date | string | null; startDate: string | null; endDate: string | null },
  stats: { expenseCount: number; openTransfers: number },
  today: string,
): TripTagValue {
  if (t.deletedAt) return 'deleted';
  if (t.status !== 'active') return stats.openTransfers === 0 ? 'ended' : 'pending_settlement';
  if (t.endDate && t.endDate < today) return 'needs_finishing';
  const withinDates = !!t.startDate && t.startDate <= today && (!t.endDate || today <= t.endDate);
  if (withinDates || stats.expenseCount > 0) return 'ongoing';
  return 'active';
}
