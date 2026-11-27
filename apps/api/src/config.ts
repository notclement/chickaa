import { isValidPayNowPayload } from '@chickaa/core';

/** Runtime configuration, read once from environment variables. */
export interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  databaseUrl: string | undefined;
  /** Public origin, e.g. https://<service>.onrender.com. Used for CSRF origin checks and invite URLs.
   *  Falls back to Render's RENDER_EXTERNAL_URL, then localhost. */
  publicOrigin: string;
  /** Folder containing the built PWA (apps/web/dist). */
  webDist: string;
  appVersion: string;
  runMigrationsOnStart: boolean;
  /** Multiplier for all rate limits (tests only). */
  rateLimitScale: number;
  /** One-time code required to create the reserved "admin" account. Unset = admin can't be created. */
  adminSetupCode: string | undefined;
  /** Time zone used for "today" when tagging trips. */
  timeZone: string;
  /** The text inside the owner's static PayNow QR (PAYNOW_QR_PAYLOAD). Unset/invalid = no PayNow on the Supporter page. */
  payNowPayload: string | undefined;
  /** Trust Cloudflare's `cf-connecting-ip` (on Render, or TRUST_CLOUDFLARE=true). */
  trustCloudflare: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = (env.NODE_ENV ?? 'development') as Config['nodeEnv'];
  const port = Number(env.PORT ?? 8080);
  return {
    port,
    nodeEnv,
    databaseUrl: env.DATABASE_URL,
    publicOrigin: (env.PUBLIC_ORIGIN ?? env.RENDER_EXTERNAL_URL ?? `http://localhost:${port}`).replace(/\/+$/, ''),
    webDist: env.WEB_DIST ?? new URL('../../web/dist', import.meta.url).pathname,
    appVersion: `1.8.0+${(env.APP_VERSION || 'dev').slice(0, 7)}`,
    runMigrationsOnStart: env.RUN_MIGRATIONS_ON_START === 'true',
    rateLimitScale: Number(env.RATE_LIMIT_SCALE ?? 1) || 1,
    adminSetupCode: env.ADMIN_SETUP_CODE?.trim() || undefined,
    timeZone: env.TZ_TRIPS ?? 'Asia/Singapore',
    payNowPayload: validPayNow(env.PAYNOW_QR_PAYLOAD),
    trustCloudflare: env.TRUST_CLOUDFLARE ? env.TRUST_CLOUDFLARE === 'true' : env.RENDER === 'true',
  };
}

function validPayNow(v: string | undefined): string | undefined {
  const text = v?.trim();
  if (!text) return undefined;
  if (isValidPayNowPayload(text)) return text;
  console.warn('PAYNOW_QR_PAYLOAD is set but is not a valid PayNow QR payload; ignoring it');
  return undefined;
}
