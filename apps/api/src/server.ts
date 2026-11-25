import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createDb } from '@ncc/db';
import { runMigrations } from '@ncc/db/migrate';
import { sql } from 'drizzle-orm';
import { createApp } from './app.ts';
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

const app = createApp({
  config,
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

function shutdown() {
  server.close();
  void database?.close();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
