import type { HealthResponse } from '@ncc/contracts';
import type { Db } from '@ncc/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { compress } from 'hono/compress';
import { loadSession } from './auth/session.ts';
import type { Config } from './config.ts';
import { errorResponse, HttpError } from './lib/http.ts';
import { setRateLimitScale } from './lib/rateLimit.ts';
import type { Env } from './lib/types.ts';
import { csrfGuard, securityHeaders } from './middleware/security.ts';
import { frankfurter, type FxProvider } from './fx/provider.ts';
import { authRoutes } from './routes/auth.ts';
import { avatarRoutes, myAvatarRoutes } from './routes/avatars.ts';
import { expenseRoutes, tripExpenseRoutes } from './routes/expenses.ts';
import { adminRoutes } from './routes/admin.ts';
import { settlementRoutes, transferRoutes } from './routes/settlement.ts';
import { inviteRoutes } from './routes/invites.ts';
import { invitationRoutes, tripRoutes } from './routes/trips.ts';
import { serveWeb } from './static.ts';

export interface AppDeps {
  config: Config;
  /** null = no DATABASE_URL (only health/ping and static files work). */
  db: Db | null;
  /** Returns true if the database answers. */
  pingDb: () => Promise<boolean>;
  /** Exchange-rate source (tests pass a fake). */
  fx?: FxProvider;
}

export function createApp({ config, db, pingDb, fx = frankfurter() }: AppDeps) {
  setRateLimitScale(config.rateLimitScale);
  const app = new Hono<Env>();
  app.use('*', securityHeaders({ hsts: config.nodeEnv === 'production' }));

  const api = new Hono<Env>();
  api.use('*', async (c, next) => {
    c.set('config', config);
    c.set('fx', fx);
    await next();
    // User data never lands in shared HTTP caches (routes may opt into private caching, e.g. avatars).
    if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
  });
  api.use('*', csrfGuard(config.publicOrigin));
  // Big JSON (e.g. 300 expenses ≈ 300 KB) shrinks ~10× on the wire (test report O6).
  api.use('*', compress({ threshold: 2048 }));
  // No legitimate request is bigger than this (photos are ≤ 24 KB, checked again in their route).
  api.use(
    '*',
    bodyLimit({
      maxSize: 64 * 1024,
      // Close the connection: the unread body would otherwise corrupt the next request on it (B6).
      onError: (c) => c.json({ error: { code: 'TOO_LARGE', message: 'Request too large' } }, 413, { Connection: 'close' }),
    }),
  );

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

  api.route('/auth/me/avatar', myAvatarRoutes);
  api.route('/auth', authRoutes);
  api.route('/users', avatarRoutes);
  api.route('/trips', tripRoutes);
  api.route('/trips', tripExpenseRoutes);
  api.route('/trips', settlementRoutes);
  api.route('/expenses', expenseRoutes);
  api.route('/settlements', transferRoutes);
  api.route('/admin', adminRoutes);
  api.route('/invitations', invitationRoutes);
  api.route('/invites', inviteRoutes);

  api.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }, 404));
  api.onError(errorResponse);

  app.route('/api/v1', api);
  app.all('/api/*', (c) => c.json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }, 404));

  serveWeb(app as unknown as Hono, config.webDist);
  return app;
}
