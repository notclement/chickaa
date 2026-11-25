import { Hono } from 'hono';
import type { HealthResponse } from '@ncc/contracts';
import type { Config } from './config.ts';
import { csrfGuard, securityHeaders } from './middleware/security.ts';
import { serveWeb } from './static.ts';

export interface AppDeps {
  config: Config;
  /** Returns true if the database answers. Injected so tests can run without Postgres. */
  pingDb: () => Promise<boolean>;
}

export function createApp({ config, pingDb }: AppDeps) {
  const app = new Hono();

  app.use('*', securityHeaders({ hsts: config.nodeEnv === 'production' }));

  const api = new Hono();
  api.use('*', csrfGuard(config.publicOrigin));
  api.use('*', async (c, next) => {
    await next();
    c.res.headers.set('Cache-Control', 'no-store'); // user data never lands in HTTP caches
  });

  api.get('/health', async (c) => {
    const dbOk = await pingDb().catch(() => false);
    const body: HealthResponse = {
      status: 'ok',
      version: config.appVersion,
      db: dbOk ? 'ok' : 'unavailable',
      time: new Date().toISOString(),
    };
    return c.json(body);
  });

  api.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }, 404));
  api.onError((err, c) => {
    console.error(err);
    return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500);
  });

  app.route('/api/v1', api);
  app.all('/api/*', (c) => c.json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }, 404));

  serveWeb(app, config.webDist);
  return app;
}
