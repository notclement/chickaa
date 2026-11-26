import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createDb } from '@ncc/db';
import { runMigrations } from '@ncc/db/migrate';
import { sql } from 'drizzle-orm';
import { createApp } from './app.ts';
import { cleanup } from './maintenance.ts';
import { FxUnavailableError, type FxProvider } from './fx/provider.ts';
import { loadConfig } from './config.ts';

// Local development: read the repo-root .env (production gets real environment variables).
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
  } catch {
    /* no .env: fine */
  }
}

const config = loadConfig();

if (config.databaseUrl && config.runMigrationsOnStart) {
  await runMigrations(config.databaseUrl);
  console.log('database migrations applied');
}

const database = config.databaseUrl ? createDb(config.databaseUrl) : null;
if (!database) console.warn('DATABASE_URL not set; running without a database');

/** Tests only: FX_FAKE_RATES="THB>SGD=0.0375,IDR>SGD=0.0000845" replaces the live provider. */
function fakeFxFromEnv(spec: string | undefined): FxProvider | undefined {
  if (!spec) return undefined;
  const table = new Map(spec.split(',').map((kv) => kv.split('=') as [string, string]));
  console.warn('[fx] using FAKE exchange rates from FX_FAKE_RATES');
  return {
    name: 'Test rates',
    async getRate(from, to, date) {
      const literal = table.get(`${from}>${to}`);
      if (!literal) throw new FxUnavailableError('no fake rate');
      return { literal, date };
    },
  };
}

const app = createApp({
  config,
  fx: fakeFxFromEnv(process.env.FX_FAKE_RATES),
  db: database?.db ?? null,
  pingDb: async () => {
    if (!database) return false;
    await database.db.execute(sql`select 1`);
    return true;
  },
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`NoChickenCall API listening on :${info.port} (${config.nodeEnv})`);
});

if (database) {
  const run = () => cleanup(database.db).catch((err) => console.error('[maintenance] cleanup failed', err));
  void run();
  setInterval(run, 6 * 60 * 60 * 1000).unref();
}

function shutdown() {
  server.close();
  void database?.close();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
