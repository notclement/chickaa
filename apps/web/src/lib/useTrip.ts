import type { TripDetail } from '@ncc/contracts';
import { useMemo } from 'react';
import { api } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';

export function useTrip(id: string | undefined) {
  const res = useApi(() => api<TripDetail>(`/trips/${id}`), [id]);
  const names = useMemo(() => new Map(res.data?.members.map((m) => [m.userId, m.displayName]) ?? []), [res.data]);
  return { ...res, trip: res.data, names, nameOf: (uid: string) => names.get(uid) ?? 'Former member' };
}
