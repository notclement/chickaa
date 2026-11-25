# Deploying NoChickenCall

Production is **one Docker container** (API + PWA, same origin) plus a **Postgres** database.
Recommended: **Fly.io** (Singapore region) + **Neon** (free Postgres). Any host that runs a Dockerfile works the same way (Render, Railway, a VPS).

## 1. Database: Neon

1. Create a project at neon.tech, region **Asia Pacific (Singapore)**.
2. Copy the connection string. It looks like
   `postgres://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

Migrations run automatically when the container starts (`RUN_MIGRATIONS_ON_START=true` in the image).
The only extension used is `citext`, which Neon allows.

## 2. App: Fly.io

### Automatic (recommended): GitHub Actions
`.github/workflows/deploy.yml` deploys every green push to `main`. One-time setup:
1. Create a Fly.io account and an **org token** (dashboard → Tokens).
2. In GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**, add
   `FLY_API_TOKEN` (the token) and `DATABASE_URL` (Neon string).
3. Optional: add a repo **variable** `FLY_APP` to choose the subdomain (default `nochickencall-clem`).
4. Actions tab → **Deploy** → *Run workflow* (or just push). It creates the app on first run,
   sets `DATABASE_URL` + `PUBLIC_ORIGIN`, deploys to Singapore and checks `/api/v1/health`.

### Manual

```bash
brew install flyctl            # or see fly.io/docs/flyctl/install
fly auth login
fly launch --no-deploy --copy-config --name <your-app-name> --region sin
fly secrets set \
  DATABASE_URL='postgres://…?sslmode=require' \
  PUBLIC_ORIGIN='https://<your-app-name>.fly.dev'
fly deploy --build-arg APP_VERSION=$(git rev-parse --short HEAD)
```

Open `https://<your-app-name>.fly.dev`. The **App status** card should show *Server: Connected* and *Database: Connected*.

`fly.toml` lets the machine sleep when idle (`min_machines_running = 0`), which is free/cheap but makes the first request after a while take a few seconds. Set it to `1` if that bothers you.

### Custom domain (optional)
```bash
fly certs add split.example.com
fly secrets set PUBLIC_ORIGIN='https://split.example.com'
```
Then add the DNS records Fly prints. `PUBLIC_ORIGIN` **must** match the address people use, or writes are rejected by the CSRF check.

## Environment variables

| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres URL; add `?sslmode=require` for Neon |
| `PUBLIC_ORIGIN` | yes | `https://host`, no trailing slash |
| `APP_VERSION` | no | Shown in the app; pass as a build arg |
| `RUN_MIGRATIONS_ON_START` | no | `true` in the image |
| `PORT` | no | default 8080 |

## Updating

`fly deploy` again. Installed apps check for a new version on launch and when brought to the
foreground, and show **"New version ready · Refresh"**. Nobody is force-reloaded mid-task.

HTTP caching is set up for this: `sw.js`, `index.html` and the manifest are `no-cache`;
hashed `/assets/*` are cached for a year. Don't put a CDN in front that overrides those headers.

## Rollback

```bash
fly releases            # find the previous version
fly deploy --image <previous image ref>
```
Migrations are forward-only, so take a Neon branch/snapshot before deploying a schema change.
