# NoChickenCall
<sub>别计较</sub>

**Travel together. Don't sweat the split.**

A mobile-first **Progressive Web App** for sharing group-trip expenses across currencies and settling everyone with the fewest possible bank transfers.

| Doc | What's in it |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | Product requirements |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Agreed design: stack, PWA, schema, API, settlement algorithm, phases |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Production deployment (Fly.io + Neon) |
| [docs/TESTING.md](docs/TESTING.md) | Automated tests + real-phone checklist |

## Status

| Phase | | |
|---|---|---|
| 1 | Foundation + PWA shell | ✅ done |
| 2 | Auth & trips | next |
| 3–8 | Financial core, expenses, settlement, tracking, offline viewing, polish | planned |

## Stack

React 19 + Vite + Tailwind v4 (PWA via `vite-plugin-pwa` / Workbox) · Hono API on Node 22 · PostgreSQL 16 + Drizzle · pnpm workspaces · Vitest + Playwright.

```
apps/web         the PWA (screens, service worker, install + update UX)
apps/api         Hono server: /api/v1 + serves the built PWA (one container)
packages/core    pure financial engine (money, splits, ledger, settlement)
packages/contracts  shared zod request/response schemas
packages/db      Drizzle schema + SQL migrations
e2e              Playwright: installability, offline, updates, layout
scripts          icon + iOS launch-screen generator
```

## Local setup

Needs **Node 22+**, **pnpm 10** (`corepack enable`), and **PostgreSQL 16** (Docker is easiest).

```bash
pnpm install
cp .env.example .env
docker compose up -d db          # or point DATABASE_URL at any Postgres 16
pnpm db:migrate
pnpm dev                         # web on http://localhost:5173, API on :8080 (proxied)
```

The service worker is **off in `pnpm dev`** (hot reload and offline caching fight each other).
To try the real PWA (install prompt, offline, updates):

```bash
pnpm build
PUBLIC_ORIGIN=http://localhost:8080 pnpm start   # http://localhost:8080
```

To open it on your phone on the same Wi-Fi you need HTTPS (service workers require it, except on
localhost). Deploy to staging ([DEPLOY.md](docs/DEPLOY.md)) or use a tunnel such as `cloudflared tunnel --url http://localhost:8080`.

## Scripts

| Command | |
|---|---|
| `pnpm dev` | Vite + API in watch mode |
| `pnpm build` | Typecheck + production build of web and API |
| `pnpm start` | Run the production server (serves API + PWA) |
| `pnpm typecheck` | TypeScript across all packages |
| `pnpm test` | Unit + API tests (Vitest) |
| `pnpm test:e2e` | Playwright against the production build (`pnpm build` first) |
| `pnpm db:generate` | New migration from `packages/db/src/schema.ts` changes |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` |
| `pnpm icons` | Regenerate icons + iOS launch screens from `scripts/brand.mjs` |
