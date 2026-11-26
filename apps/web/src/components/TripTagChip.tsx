import type { TripTag } from '@chickaa/contracts';

/** Colour-coded trip status (admin view). */
export const TAGS: Record<TripTag, { label: string; className: string; help: string }> = {
  active: { label: 'Active', className: 'bg-[#DDE9FF] text-[#1D4ED8]', help: 'Created, no transactions yet (invites / pre-trip)' },
  ongoing: { label: 'On-going', className: 'bg-owed/15 text-owed', help: 'Within the trip dates, or has transactions' },
  needs_finishing: { label: 'Needs finishing', className: 'bg-[#EDE3FF] text-[#6D28D9]', help: 'End date passed, owner hasn’t finished it' },
  pending_settlement: { label: 'Pending settlement', className: 'bg-sun-300/70 text-[#92400E]', help: 'Finished, payments not all confirmed' },
  ended: { label: 'Ended', className: 'bg-ink-900/10 text-ink-700', help: 'Finished and fully settled' },
  deleted: { label: 'Deleted', className: 'bg-owes/15 text-owes', help: 'Deleted by the owner' },
};

export function TripTagChip({ tag }: { tag: TripTag }) {
  const t = TAGS[tag];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${t.className}`} title={t.help} data-testid="trip-tag">
      {t.label}
    </span>
  );
}
