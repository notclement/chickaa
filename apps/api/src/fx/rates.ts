import { rateFromLiteral, rateToString } from '@ncc/core';
import { schema, type Db } from '@ncc/db';
import { and, eq } from 'drizzle-orm';
import { HttpError } from '../lib/http.ts';
import { FxUnavailableError, type FxProvider } from './provider.ts';

export interface ResolvedRate {
  rate: string;
  /** Date the provider published it. */
  date: string;
  provider: string | null;
}

/**
 * Daily API rate for from→to on `date`, cached in Postgres forever: once an expense uses a
 * rate it must never change (SPEC §9), and the cache means we ask the provider at most once.
 */
export async function apiRate(db: Db, provider: FxProvider, from: string, to: string, date: string): Promise<ResolvedRate> {
  const t = schema.fxRateCache;
  const [hit] = await db
    .select()
    .from(t)
    .where(and(eq(t.base, from), eq(t.quote, to), eq(t.rateDate, date)))
    .limit(1);
  if (hit) return { rate: rateToString(rateFromLiteral(hit.rate)), date: hit.publishedDate ?? date, provider: hit.provider };

  let fetched;
  try {
    fetched = await provider.getRate(from, to, date);
  } catch (err) {
    if (err instanceof FxUnavailableError) {
      throw new HttpError(503, 'FX_UNAVAILABLE', `Couldn’t get the ${from}→${to} exchange rate right now. Enter the rate yourself.`);
    }
    throw err;
  }
  const rate = rateToString(rateFromLiteral(fetched.literal));
  await db
    .insert(t)
    .values({ base: from, quote: to, rateDate: date, rate, publishedDate: fetched.date, provider: provider.name })
    .onConflictDoNothing();
  return { rate, date: fetched.date, provider: provider.name };
}
