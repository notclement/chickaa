import { rateFromLiteral } from '@chickaa/core';
import { describe, expect, it } from 'vitest';
import { frankfurter } from '../src/fx/provider.ts';

/** Talks to the real Frankfurter API. Runs in CI only (FX_LIVE=1) as an early warning if its format changes. */
describe.skipIf(!process.env.FX_LIVE)('Frankfurter (live)', () => {
  const fx = frankfurter();
  it.each([
    ['THB', 'SGD'],
    ['IDR', 'SGD'],
    ['JPY', 'SGD'],
    ['SGD', 'IDR'],
    ['CNY', 'SGD'],
  ])('%s → %s for a past weekday and a weekend', async (from, to) => {
    for (const date of ['2026-03-04', '2026-03-07']) {
      const r = await fx.getRate(from, to, date);
      expect(rateFromLiteral(r.literal).num > 0n).toBe(true);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.date <= date).toBe(true);
    }
  }, 30_000);
});
