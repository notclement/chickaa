/**
 * Exchange-rate provider: Frankfurter (free, no API key, central-bank reference rates).
 * Rates are read from the raw JSON text so they never pass through a float.
 */
export interface ProviderRate {
  /** Numeric literal exactly as the provider wrote it, e.g. "0.037512" or "8.45e-5". */
  literal: string;
  /** Date the rate was published (weekends/holidays fall back to the previous business day). */
  date: string;
}

export interface FxProvider {
  name: string;
  getRate(from: string, to: string, date: string): Promise<ProviderRate>;
}

export class FxUnavailableError extends Error {}

const NUM = '(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function frankfurter(fetchImpl: typeof fetch = fetch, base = 'https://api.frankfurter.dev'): FxProvider {
  async function get(url: string): Promise<string | null> {
    try {
      const res = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  return {
    name: 'Frankfurter',
    async getRate(from, to, date) {
      const latest = date >= today();
      const f = from.toLowerCase();
      const t = to.toLowerCase();

      // v2: GET /v2/rate/{from}/{to}?date=YYYY-MM-DD
      const v2 = await get(`${base}/v2/rate/${f}/${t}${latest ? '' : `?date=${date}`}`);
      const v2Rate = v2 && new RegExp(`"rate"\\s*:\\s*${NUM}`).exec(v2)?.[1];
      if (v2 && v2Rate) {
        const d = /"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/.exec(v2)?.[1];
        return { literal: v2Rate, date: d ?? (latest ? today() : date) };
      }

      // v1 (ECB currencies): GET /v1/{date|latest}?base=FROM&symbols=TO
      const v1 = await get(`${base}/v1/${latest ? 'latest' : date}?base=${from}&symbols=${to}`);
      const v1Rate = v1 && new RegExp(`"${to}"\\s*:\\s*${NUM}`).exec(v1)?.[1];
      if (v1 && v1Rate) {
        const d = /"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/.exec(v1)?.[1];
        return { literal: v1Rate, date: d ?? date };
      }

      throw new FxUnavailableError(`No rate for ${from}→${to} on ${date}`);
    },
  };
}
