/** Runtime configuration, read once from environment variables. */
export interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  databaseUrl: string | undefined;
  /** Public origin, e.g. https://nochickencall.fly.dev. Used for CSRF origin checks and invite URLs. */
  publicOrigin: string;
  /** Folder containing the built PWA (apps/web/dist). */
  webDist: string;
  appVersion: string;
  runMigrationsOnStart: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = (env.NODE_ENV ?? 'development') as Config['nodeEnv'];
  const port = Number(env.PORT ?? 8080);
  return {
    port,
    nodeEnv,
    databaseUrl: env.DATABASE_URL,
    publicOrigin: env.PUBLIC_ORIGIN ?? `http://localhost:${port}`,
    webDist: env.WEB_DIST ?? new URL('../../web/dist', import.meta.url).pathname,
    appVersion: env.APP_VERSION ?? '0.1.0',
    runMigrationsOnStart: env.RUN_MIGRATIONS_ON_START === 'true',
  };
}
