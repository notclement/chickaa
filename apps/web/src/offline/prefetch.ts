import type { TripSummary } from '@ncc/contracts';
import { api } from '../api/client.ts';

const KEY = 'ncc.user.prefetchedAt';
const EVERY_MS = 10 * 60 * 1000;

/**
 * Downloads each active trip's screens in the background (while online) so they can be viewed
 * offline even if they weren't opened recently. Throttled to once every 10 minutes.
 */
export async function prefetchTrips(trips: TripSummary[]): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const last = Number(localStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < EVERY_MS) return;
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage unavailable: still prefetch */
  }
  for (const t of trips.filter((x) => x.status !== 'archived').slice(0, 10)) {
    for (const path of [`/trips/${t.id}`, `/trips/${t.id}/expenses`, `/trips/${t.id}/balances`, `/trips/${t.id}/settlement`]) {
      if (!navigator.onLine) return;
      await api(path).catch(() => {}); // the API client stores each response for offline use
    }
  }
}
