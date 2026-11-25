# Deploying NoChickenCall

Production is **one Docker container** (API + PWA, same origin) plus **Postgres**.
Current setup: **Render free web service** (Singapore) + **Neon free Postgres**. Neither needs a credit card.

## One-time setup

### 1. Database: Neon
1. Sign up at https://console.neon.tech/signup (Sign in with GitHub is quickest).
2. Create a project: any name, Postgres 16+, region **AWS Asia Pacific (Singapore)**.
3. On the project dashboard click **Connect**, then copy the connection string. It looks like
   `postgresql://neondb_owner:…@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

### 2. App: Render
1. Open https://render.com/deploy?repo=https://github.com/notclement/nochickencall
2. Sign up / sign in **with GitHub** and allow Render access to the `nochickencall` repo.
3. Render reads `render.yaml` and asks for **DATABASE_URL**: paste the Neon string, then click **Apply / Deploy Blueprint**.
4. The first build takes ~3–5 min. The app is then live at `https://nochickencall.onrender.com`
   (Render adds a suffix if that name is taken; the dashboard shows the real URL).

Migrations run automatically on start. `PUBLIC_ORIGIN` comes from Render's `RENDER_EXTERNAL_URL` automatically.

## After that: automatic
Every push to `main` runs CI on GitHub. Render deploys it **only if CI passes** (`autoDeployTrigger: checksPass`).
Installed apps notice the new version and show **"New version ready · Refresh"**.

## Free-tier behaviour to know
- The server **sleeps after 15 min** with no visitors and takes **up to ~1 min** to wake.
  The installed app still **opens instantly** because the shell is cached on the phone; only loading data waits for the server.
- 750 free hours/month per workspace, enough for one always-available service.
- To remove the sleep: change `plan: free` to `plan: starter` in `render.yaml` (paid).

## Custom domain (optional)
Render dashboard → service → **Settings → Custom Domains**. Then add an env var
`PUBLIC_ORIGIN=https://your.domain` (must match exactly, or writes are rejected by the CSRF check).

## Environment variables

| Name | Set by | Notes |
|---|---|---|
| `DATABASE_URL` | you (once) | Neon string with `?sslmode=require` |
| `PUBLIC_ORIGIN` | automatic | Falls back to `RENDER_EXTERNAL_URL`; override for custom domains |
| `NODE_ENV`, `RUN_MIGRATIONS_ON_START` | render.yaml | |
| `PORT` | Render | Injected automatically |

## Caching rules (don't override with a CDN)
`sw.js`, `index.html` and the manifest are `no-cache`; hashed `/assets/*` are cached for a year.

## Other hosts
Any platform that builds a Dockerfile works the same way (Fly.io config is in `fly.toml`):
set `DATABASE_URL` and `PUBLIC_ORIGIN`, expose port `$PORT`.

## Rollback
Render dashboard → service → **Events** → pick a previous deploy → **Rollback**.
Migrations are forward-only: create a Neon branch (snapshot) before deploying schema changes.
