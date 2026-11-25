// Bundles the API (and the workspace TS packages it imports) into one ESM file.
// Native / heavy runtime deps that can't be bundled go in `external`.
import { cp, rm } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/server.ts', '../../packages/db/src/migrate-cli.ts'],
  outdir: 'dist',
  entryNames: '[name]',
  // migrate-cli.ts → dist/migrate-cli.js (run: node dist/migrate-cli.js)
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: [],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});

// Ship SQL migrations next to the bundle: dist/migrate.js resolves '../migrations'.
await rm('migrations', { recursive: true, force: true });
await cp('../../packages/db/migrations', 'migrations', { recursive: true });
