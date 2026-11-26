# Deploying ChickAA

Production is **one Docker container** (API + PWA, same origin) plus **Postgres**.
Current setup: **Render free web service** (Singapore) + **Neon free Postgres**. Neither needs a credit card.

## One-time setup

### 1. Database: Neon
1. Sign up at https://console.neon.tech/signup (Sign in with GitHub is quickest).
2. Create a project: any name, Postgres 16+, region **AWS Asia Pacific (Singapore)**.
3. On the project dashboard click **Connect**, then copy the connection string. It looks like
   `postgresql://neondb_owner:…@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

### 2. App: Render
1. Open https://render.com/deploy?repo=https://github.com/notclement/chickaa
2. Sign up / sign in **with GitHub** and allow Render access to the `chickaa` repo.
3. Render reads `render.yaml` and asks for **DATABASE_URL**: paste the Neon string, then click **Apply / Deploy Blueprint**.
4. The first build takes ~3–5 min. The app is then live at `https://nochickencall.onrender.com`
   (Render adds a suffix if that name is taken; the dashboard shows the real URL).

Migrations run automatically on start. `PUBLIC_ORIGIN` comes from Render's `RENDER_EXTERNAL_URL` automatically.

## After that: automatic
Every push to `main` runs CI on GitHub. Render deploys it **only if CI passes** (`autoDeployTrigger: checksPass`).
Installed apps notice the new version and show **"New version ready · Refresh"**.

## Keep it awake (free uptime pinger)
Render's free server sleeps after 15 idle minutes. One service running all month uses ≤ 744 of the
750 free hours, so a pinger every 10 minutes keeps it awake for free.

1. Sign up at https://console.cron-job.org/signup (free).
2. **Create cronjob**:
   - URL: `https://nochickencall.onrender.com/api/v1/ping`
   - Schedule: **every 10 minutes**
   - Save.

Ping `/api/v1/ping`, **not** `/api/v1/health`: `/ping` doesn't touch the database, so Neon can still
sleep between real uses. Neon's free plan has 100 compute-hours/month, and a database that's
kept awake 24/7 would use them up mid-month.

The app also wakes the server itself: opening the app (or bringing it back to the foreground) fires a
background `/api/v1/health` request, and any request slower than 2.5 s shows a
"Waking up the server…" banner instead of a frozen screen.

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
| `PAYNOW_QR_PAYLOAD` | you (privately) | The text inside your static PayNow QR (contains your PayNow number, so keep it out of the repo). Unset = the Supporter page says supporting isn't open yet. Invalid text is ignored with a log warning |
| `ADMIN_SETUP_CODE` | you (privately) | One-time code to create the `admin` account. Unset = admin can't be created. Can be removed once the admin exists |

## Caching rules (don't override with a CDN)
`sw.js`, `index.html` and the manifest are `no-cache`; hashed `/assets/*` are cached for a year.

## Other hosts
Any platform that builds a Dockerfile works the same way (Fly.io config is in `fly.toml`):
set `DATABASE_URL` and `PUBLIC_ORIGIN`, expose port `$PORT`.

## Housekeeping
The server deletes sessions that ended more than 7 days ago and old rate-limit records every 6 hours. No cron job is needed.

## Release checklist
1. CI green on `main` (typecheck, unit, API, e2e, Docker build).
2. Render shows the new commit deployed; **Account → App status** shows the same version for app and server.
3. Real-phone checklist in [TESTING.md](TESTING.md) on iPhone + Android.
4. Tag the release: `git tag v1.0.0 && git push --tags`, and move the CHANGELOG entry from `-rc` to the final version.

## Rollback
Render dashboard → service → **Events** → pick a previous deploy → **Rollback**.
Migrations are forward-only: create a Neon branch (snapshot) before deploying schema changes.
