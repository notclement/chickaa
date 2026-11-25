import type { HealthResponse } from '@ncc/contracts';
import type { Db } from '@ncc/db';
import { Hono } from 'hono';
import { loadSession } from './auth/session.ts';
import type { Config } from './config.ts';
import { errorResponse, HttpError } from './lib/http.ts';
import { setRateLimitScale } from './lib/rateLimit.ts';
import type { Env } from './lib/types.ts';
import { csrfGuard, securityHeaders } from './middleware/security.ts';
import { authRoutes } from './routes/auth.ts';
import { inviteRoutes } from './routes/invites.ts';
import { invitationRoutes, tripRoutes } from './routes/trips.ts';
import { serveWeb } from './static.ts';

export interface AppDeps {
  config: Config;
  /** null = no DATABASE_URL (only health/ping and static files work). */
  db: Db | null;
  /** Returns true if the database answers. */
  pingDb: () => Promise<boolean>;
}

export function createApp({ config, db, pingDb }: AppDeps) {
  setRateLimitScale(config.rateLimitScale);
  const app = new Hono<Env>();
  app.use('*', securityHeaders({ hsts: config.nodeEnv === 'production' }));

  const api = new Hono<Env>();
  api.use('*', async (c, next) => {
    c.set('config', config);
    await next();
    c.res.headers.set('Cache-Control', 'no-store'); // user data never lands in HTTP caches
  });
  api.use('*', csrfGuard(config.publicOrigin));

  /** Keep-alive target for uptime pingers: never touches the database, so Neon can still sleep. */
  api.get('/ping', (c) => c.text('pong'));

  /** Full health check: also wakes the database. The app calls this when it opens. */
  api.get('/health', async (c) => {
    const dbOk = await pingDb().catch(() => false);
    const res: HealthResponse = {
      status: 'ok',
      version: config.appVersion,
      db: dbOk ? 'ok' : 'unavailable',
      time: new Date().toISOString(),
    };
    return c.json(res);
  });

  api.use('*', async (c, next) => {
    if (!db) throw new HttpError(503, 'UNAVAILABLE', 'The database isn’t configured');
    c.set('db', db);
    await next();
  });
  api.use('*', loadSession);

  api.route('/auth', authRoutes);
  api.route('/trips', tripRoutes);
  api.route('/invitations', invitationRoutes);
  api.route('/invites', inviteRoutes);

  api.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }, 404));
  api.onError(errorResponse);

  app.route('/api/v1', api);
  app.all('/api/*', (c) => c.json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }, 404));

  serveWeb(app as unknown as Hono, config.webDist);
  return app;
}
