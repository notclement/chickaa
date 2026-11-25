import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import type { Hono } from 'hono';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

/**
 * Serves the built PWA.
 *  - Hashed assets (/assets/*) are immutable → cached for a year.
 *  - sw.js, index.html and the manifest must never be cached by HTTP caches,
 *    otherwise installed apps would miss updates (ARCHITECTURE.md §3.4).
 *  - Any other non-API path falls back to index.html (SPA routing).
 */
export function serveWeb(app: Hono, webDist: string): void {
  const root = normalize(webDist);

  async function file(path: string): Promise<{ body: Buffer; type: string } | null> {
    const full = normalize(join(root, path));
    if (!full.startsWith(root + sep) && full !== root) return null; // path traversal
    try {
      const s = await stat(full);
      if (!s.isFile()) return null;
      return { body: await readFile(full), type: TYPES[extname(full)] ?? 'application/octet-stream' };
    } catch {
      return null;
    }
  }

  function cacheControl(path: string): string {
    if (path.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
    if (path === '/sw.js' || path.endsWith('.html') || path.endsWith('.webmanifest')) return 'no-cache';
    return 'public, max-age=3600';
  }

  app.get('*', async (c, next) => {
    const path = c.req.path;
    if (path.startsWith('/api/')) return next();
    const hit = path !== '/' ? await file(path) : null;
    if (hit) {
      return c.body(new Uint8Array(hit.body), 200, { 'Content-Type': hit.type, 'Cache-Control': cacheControl(path) });
    }
    // Unknown asset-looking paths (with an extension) are real 404s, not the SPA.
    if (extname(path) && path !== '/') return c.notFound();
    const index = await file('/index.html');
    if (!index) return c.text('Web build not found. Run `pnpm build`.', 503);
    return c.body(new Uint8Array(index.body), 200, { 'Content-Type': index.type, 'Cache-Control': 'no-cache' });
  });
}
