import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/** Applies pending migrations. Used locally, in CI, and on container start. */
export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../migrations', import.meta.url)),
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}
