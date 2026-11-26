import type { TripDetail } from '@chickaa/contracts';
import { useEffect, useMemo } from 'react';
import { api } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { registerAvatars } from './avatars.ts';

export function useTrip(id: string | undefined) {
  // Only fetch once there's an id (e.g. an expense screen learns its tripId after loading).
  const res = useApi(() => (id ? api<TripDetail>(`/trips/${id}`) : Promise.resolve(undefined)), [id]);
  useEffect(() => {
    if (res.data) registerAvatars(res.data.members.map((m) => ({ id: m.userId, avatarVersion: m.avatarVersion })));
  }, [res.data]);
  const names = useMemo(() => new Map(res.data?.members.map((m) => [m.userId, m.displayName]) ?? []), [res.data]);
  return { ...res, trip: res.data, names, nameOf: (uid: string) => names.get(uid) ?? 'Former member' };
}
