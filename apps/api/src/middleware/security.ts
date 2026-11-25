import type { MiddlewareHandler } from 'hono';

/**
 * Strict security headers for every response (ARCHITECTURE.md §3.6).
 * The PWA ships no inline scripts or third-party assets, so the CSP can be tight.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function securityHeaders(opts: { hsts: boolean }): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set('Content-Security-Policy', CSP);
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    h.set('X-Frame-Options', 'DENY');
    h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    h.set('Cross-Origin-Opener-Policy', 'same-origin');
    if (opts.hsts) h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  };
}

/**
 * CSRF defence for state-changing API calls (on top of SameSite=Lax cookies):
 * require a same-origin Origin header and our custom X-Requested-With header,
 * which a cross-site form post cannot set.
 */
export function csrfGuard(allowedOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
    const origin = c.req.header('origin');
    const xrw = c.req.header('x-requested-with');
    if (origin !== allowedOrigin || xrw !== 'ncc') {
      return c.json({ error: { code: 'CSRF', message: 'Cross-site request blocked' } }, 403);
    }
    return next();
  };
}
