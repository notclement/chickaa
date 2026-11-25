# NoChickenCall: Architecture & Design (draft for review)

> Status: **DRAFT, under review with Clem.** Nothing gets built until the open decisions in §0 are settled.
> Source of truth for scope: [SPEC.md](SPEC.md). This doc covers *how* to build it.

Guiding rule: **the app is a PWA first.** Every choice below is judged on whether it makes the
installed, sometimes-offline phone experience on iOS Safari and Android Chrome reliable. Financial
correctness comes a close second. Everything else comes after those two.

---

## 0. Open decisions (need Clem's call)

| # | Decision | Recommendation | Alternative |
|---|----------|----------------|-------------|
| D1 | Frontend/backend stack | **Vite + React SPA + Hono API, same origin, one deployable** (see §1.1) | Next.js App Router + Serwist, as the spec suggests |
| D2 | What works offline | **Create expenses offline; edit/delete only *unsynced* local ones.** Editing already-synced expenses needs a connection | Full offline editing with 3-way conflict resolution |
| D3 | Foreign-currency expense recorded offline | **Use the last rate the phone downloaded for that trip, clearly labelled "offline rate"**, with an option to type a manual rate | Force a manual rate whenever offline |
| D4 | Hosting | **Single Docker container (API + static PWA) on Fly.io / Render / Railway + Neon Postgres** | Vercel (static + functions) + Neon; or your own VPS |

Defaults I've assumed unless you object (spec clean-ups, see §10):
- "Unequal split" and "Exact amount split" are the same thing → merged into **Exact amounts**.
- All payers of one expense pay in **that expense's currency** (no mixed-currency payers on a single expense).
- Members can't be removed once they're involved in any expense. They can leave only if their balance is untouched.
- IDR, JPY, KRW and VND are handled with **0 decimal places**.

---

## 1. Recommended architecture

```
 ┌───────────────────────── Phone / Desktop browser ─────────────────────────┐
 │  Installed PWA (standalone)                                               │
 │  ┌──────────────┐   ┌──────────────────────┐   ┌───────────────────────┐  │
 │  │ React SPA UI │──▶│ Local store (Dexie / │◀──│ Sync engine (outbox,  │  │
 │  │ (all screens │   │ IndexedDB, per-user) │   │ retries, idempotency) │  │
 │  │  precached)  │   └──────────────────────┘   └──────────┬────────────┘  │
 │  └──────────────┘                                         │ fetch /api/v1 │
 │  ┌──────────────────────────────────────┐                 │ (cookie auth) │
 │  │ Service worker (Workbox): app shell, │                 │               │
 │  │ static assets, update prompt.        │                 │               │
 │  │ NO user data in Cache Storage.       │                 │               │
 │  └──────────────────────────────────────┘                 │               │
 └───────────────────────────────────────────────────────────┼───────────────┘
                                                             ▼  HTTPS, same origin
 ┌──────────────────────── Server (one container) ──────────────────────────┐
 │ Hono (Node) ─ serves /api/v1/* and the static PWA build                  │
 │   auth · trips · invites · expenses · fx · ledger · settlement           │
 │   uses packages/core (pure TS financial engine, same code as client)     │
 └───────────────────────────────┬──────────────────────────────────────────┘
                                 ▼
                    PostgreSQL (Drizzle ORM + migrations)
                    Frankfurter FX API (free, no key), cached in DB
```

### 1.1 Why a SPA and not Next.js (D1)

The spec *recommends* Next.js. Serwist (the maintained next-pwa successor) does now support Next 16 / Turbopack, so Next.js is viable.
But for an **offline-first** PWA a plain SPA is the more reliable fit:

| Concern | Vite SPA + Hono | Next.js App Router |
|---|---|---|
| Open `/trips/abc123` with no signal | Works: SW serves the precached `index.html`, router renders from IndexedDB | Dynamic routes aren't precachable. You get an offline fallback page unless every screen is restructured to be client-only |
| Client navigation offline | Pure client routing, no network | App Router fetches RSC payloads per navigation. These need extra caching rules and break in subtle ways |
| Service worker tooling | `vite-plugin-pwa` (Workbox), the most widely used and battle-tested path | Serwist works, but it's a younger integration with bundler-specific setup |
| CSP | Easy, no inline scripts | Needs nonces for inline RSC scripts |
| Server rendering / SEO | Not needed: everything is behind login | Its main strength, which we don't use |

**Recommendation:** Vite + React + TypeScript + Tailwind for the PWA, and Hono on Node for the API.
Hono is lightweight and structured, which satisfies the spec's "NestJS or equivalent". Both ship in **one container on one origin**.
Same-origin matters for PWAs: the session cookie is first-party, which avoids Safari ITP / third-party cookie problems, there's no CORS, and the SW scope stays simple.

### 1.2 Technology list

| Layer | Choice | Notes |
|---|---|---|
| UI | React 19, TypeScript, Tailwind CSS v4, React Router (or TanStack Router) | Mobile-first, accessible primitives (Radix/Ark) |
| PWA | `vite-plugin-pwa` (Workbox), `injectManifest` mode with our own `sw.ts` | Lets us add update + Background Sync logic |
| Local data | Dexie (IndexedDB) + `dexie-react-hooks` `useLiveQuery` | UI reads from local DB, so it works the same online and offline |
| Server state fetch | Thin fetch client + TanStack Query for online-only actions | |
| Validation | Zod schemas in `packages/contracts`, shared by client and server | |
| API | Hono on Node 22 | REST, versioned `/api/v1` |
| DB | PostgreSQL 16 + Drizzle ORM + drizzle-kit migrations | |
| Money math | `bigint` minor units + `big.js` for rate multiplication | No floats, ever |
| Passwords | Argon2id via `@node-rs/argon2` | |
| QR | `qrcode` (client-side, so it works offline too) | |
| FX | Frankfurter (`api.frankfurter.dev`, free, no key, ~200 currencies, historical) | Manual rate always available as a fallback |
| Tests | Vitest (unit/integration, incl. property tests with fast-check), Playwright (e2e + offline), Lighthouse CI (PWA checks) | Real iOS device testing is manual, see §9 |

---

## 2. Project folder structure

pnpm workspaces monorepo:

```
nochickencall/
├─ apps/
│  ├─ web/                      # The PWA
│  │  ├─ public/
│  │  │  ├─ icons/              # 192, 512, maskable-512, apple-touch-icon-180
│  │  │  └─ splash/             # iOS apple-touch-startup-image set (generated)
│  │  ├─ src/
│  │  │  ├─ app/                # router, layout shell, providers
│  │  │  ├─ screens/            # Login, MyTrips, CreateTrip, TripDashboard,
│  │  │  │                      # AddExpense, ExpenseList, Balances, SettleUp, Summary, JoinTrip
│  │  │  ├─ components/         # Brand lockup (NoChickenCall / 别计较), money input, member picker...
│  │  │  ├─ pwa/                # sw.ts, registerSW, UpdateToast, InstallPrompt (+ iOS instructions)
│  │  │  ├─ offline/            # dexie schema, outbox, syncEngine, connectivity store
│  │  │  ├─ api/                # typed fetch client
│  │  │  └─ styles/
│  │  └─ vite.config.ts         # vite-plugin-pwa + manifest
│  └─ api/                      # Hono server
│     ├─ src/
│     │  ├─ routes/             # auth, trips, invites, expenses, fx, balances, settlements
│     │  ├─ services/           # business logic, transactions
│     │  ├─ middleware/         # session, csrf/origin check, rate-limit, security headers
│     │  ├─ fx/                 # Frankfurter client + DB cache
│     │  └─ server.ts           # also serves apps/web/dist with SPA fallback
│     └─ test/
├─ packages/
│  ├─ core/                     # PURE financial engine, no I/O
│  │  ├─ money.ts  currency.ts  fx.ts  allocate.ts
│  │  ├─ splits.ts  ledger.ts  settlement/
│  │  └─ __tests__/             # written FIRST (spec rule 11)
│  ├─ contracts/                # zod request/response schemas + types
│  └─ db/                       # drizzle schema, migrations, seed
├─ e2e/                         # Playwright: flows, offline, sync, install manifest
├─ docs/  SPEC.md  ARCHITECTURE.md  DECISIONS.md  DEPLOY.md
├─ Dockerfile  docker-compose.yml (local Postgres)  .env.example
└─ .github/workflows/ci.yml     # lint, typecheck, unit, integration (pg service), e2e, lighthouse
```

`packages/core` runs on **both** sides. The client uses it to preview splits and balances, including offline.
The server uses the same code as the **authority**. Server results always overwrite client previews.

---

## 3. PWA implementation (the critical part)

### 3.1 Manifest (`manifest.webmanifest`)

```json
{
  "id": "/",
  "name": "NoChickenCall (别计较)",
  "short_name": "NoChickenCall",
  "description": "Travel together. Don't sweat the split.",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "display_override": ["standalone"],
  "orientation": "portrait",
  "theme_color": "<brand>",
  "background_color": "<brand-bg>",
  "icons": [
    { "src": "/icons/192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

iOS extras in `index.html`: `apple-touch-icon` (180), `apple-mobile-web-app-capable`,
`apple-mobile-web-app-status-bar-style=black-translucent`, `apple-mobile-web-app-title`,
a generated set of `apple-touch-startup-image` splash screens, and
`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
Layout uses `env(safe-area-inset-*)` for the notch and home indicator. Body text inputs are ≥16px so iOS doesn't auto-zoom.

### 3.2 Install experience

- **Android / desktop Chrome & Edge:** capture `beforeinstallprompt` and show our own "Install app" button.
- **iOS Safari:** there's no install prompt API. Detect iOS + not standalone and show a dismissible sheet: *Share → Add to Home Screen*.
- When already running standalone (`display-mode: standalone` / `navigator.standalone`), hide all install UI.
- After first login in the installed app, call `navigator.storage.persist()` to reduce the risk of eviction.

### 3.3 Service worker

Generated by Workbox (`injectManifest`) from `apps/web/src/pwa/sw.ts`:

| Request | Strategy |
|---|---|
| Build assets (hashed JS/CSS/fonts/icons) | **Precache** at install, versioned by Workbox revision hashes |
| Navigations (any route) | **Serve precached `index.html`** (navigation fallback), so every screen opens offline |
| `/api/*` | **Network only, never cached by the SW.** Offline data lives in IndexedDB (§4), not Cache Storage. This keeps user data out of shared caches and makes logout cleanup reliable |
| FX rates | Not SW-cached. Stored per trip in IndexedDB by the sync engine |

- Cache versioning and old-cache cleanup: Workbox `cleanupOutdatedCaches()` + precache revisions.
- Fonts are self-hosted, with no third-party CDN, which keeps CSP and offline simple.

### 3.4 Updates

- `registerType: 'prompt'`. A new SW installs and **waits**; it does *not* `skipWaiting` automatically.
- The app shows a toast: **"New version ready · Refresh"**. Tap → `postMessage('SKIP_WAITING')` → `controllerchange` → reload.
- Before reloading, the sync engine flushes the outbox if online. Pending expenses are in IndexedDB anyway, so an update **never loses them**.
- Dexie schema has explicit versions with upgrade functions. Outbox items carry `payloadVersion`, and the API keeps accepting older payload versions for at least one release.
- On app start and on `visibilitychange → visible`, call `registration.update()` so the installed app notices deploys.

### 3.5 Platform realities we design around

| Reality | What we do |
|---|---|
| **iOS has no Background Sync API** | Sync runs when the app opens, on the `online` event, on returning to foreground, right after saving, and every 30s while there are pending items. Chromium Background Sync is used only as a bonus |
| **iOS installed PWA has separate storage/cookies from Safari** | Logging in in Safari doesn't log you into the home-screen app. The installed app has its own login screen, and sessions are long-lived (§7) so you log in once per device |
| **Invite links from WhatsApp open in Safari, not the installed app (iOS)** | The join page works fully in the browser. After joining it says *"Open NoChickenCall from your home screen"*. "My Trips" also has **Paste invite link** so you can join from inside the installed app |
| Safari may clear website data for sites not used for a while | Home-screen apps are treated better. We also request persistent storage, and the server is the source of truth, so the worst case is re-downloading after login. Unsynced items are the only thing at risk, and the UI nags until they're synced |
| No push notifications | Out of scope anyway |

### 3.6 PWA security

- HTTPS only. HSTS. Strict CSP: `default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; frame-ancestors 'none'`.
- Session is an **httpOnly, Secure, SameSite=Lax cookie**. Nothing auth-related goes in localStorage or IndexedDB.
- IndexedDB database is **named per user** (`ncc-<userId>`). On logout: warn if unsynced items exist → delete that database → clear any runtime caches → server revokes the session.
- On login as a different user, the previous user's local DB is never opened.

---

## 4. Offline data & synchronisation design

### 4.1 Local store (Dexie, per user)

```
trips        (id, name, baseCurrency, status, updatedAt, ...)        ← server snapshot
members      ([tripId+userId], displayName, role)
expenses     (id, tripId, version, ..., payers[], splits[])          ← server snapshot
balances     (tripId, computedAt, rows[])                            ← server snapshot
settlement   (tripId, planVersion, isOptimal, transfers[])           ← server snapshot
fxRates      ([tripId+currency], rate, rateDate, source)             ← for offline entry
outbox       (clientId PK, tripId, kind, payload, payloadVersion,
              status, attempts, lastError, createdAt, updatedAt)
meta         (key, value)    e.g. lastSyncAt per trip
```

The UI renders **server data merged with outbox items**. Outbox expenses show a badge, and balances that include them are labelled *"includes 2 unsynced expenses (estimate)"*.

### 4.2 Outbox item states (shown in UI)

`saved_locally → waiting_to_sync → syncing → synced` (then removed from the outbox)
or `→ failed (retrying)` / `→ needs_attention` (validation or conflict, the user must act).

### 4.3 Sync protocol

1. Each new expense gets a **client UUID (`clientId`, UUIDv7)** at creation time, before any network call.
2. `POST /api/v1/trips/:tripId/expenses` with `clientId` in the body plus an `Idempotency-Key: <clientId>` header.
3. Server, inside one DB transaction:
   - `UNIQUE (trip_id, client_id)` on `expenses`. If it already exists **with the same payload hash**, return `200` with the existing expense: **a duplicate is impossible**.
   - Same `clientId` but a different payload → `409 conflict` → `needs_attention`.
   - Validate membership, trip is `active`, splits/payers reconcile, rate present → `201`.
   - Validation failure (e.g. trip completed meanwhile) → `422` → `needs_attention` with a plain-language reason.
4. Client replaces the outbox item with the server's expense record.
5. Network errors and 5xx → exponential backoff (5s → 5min cap), and the item stays in IndexedDB across app restarts.
6. After pushing, pull fresh snapshots: `GET /api/v1/trips/:id/snapshot` returns trip, members, expenses, balances and the current settlement plan, with an `ETag` so unchanged trips cost a `304`.

### 4.4 Edits and conflicts (D2)

- Every server expense has an integer `version`. Edits/deletes send `If-Match: <version>`. A stale version gets `409` with the current server copy, and the UI shows *"Someone changed this expense"* with theirs vs yours, letting you re-apply or discard. **Nothing is silently overwritten.**
- Recommended scope (D2): **edit/delete of synced expenses requires a connection**. Unsynced local expenses can be freely edited or deleted offline because they only exist on that phone. This covers the realistic travel case without a full offline merge engine.

### 4.5 Offline rules for money actions

- Mark as sent, confirm receipt, dispute, cancel, complete trip, generate settlement: **online only**. Buttons are disabled offline with a short explanation.
- Offline foreign-currency expense (D3): uses the last rate downloaded for that trip and stores it with `rateSource = 'offline_cached'` and its `rateDate`. The server **accepts the rate as recorded** (it's explicit and visible, never silently changed), and the expense is labelled with that rate. The user can always type a manual rate instead.

---

## 5. Database schema (PostgreSQL, Drizzle)

All money is `BIGINT` **minor units**. Rates are `NUMERIC(24,12)`. Currencies are `CHAR(3)` ISO 4217. IDs are UUID.

```
users
  id PK, username CITEXT UNIQUE, password_hash, display_name,
  recovery_code_hash, created_at, updated_at

sessions
  id PK, user_id FK→users, token_hash UNIQUE, created_at, last_seen_at,
  expires_at, revoked_at, user_agent
  INDEX (user_id)

rate_limits                      -- login/recovery throttling without Redis
  key PK (e.g. 'login:ip:1.2.3.4', 'login:user:alice'), window_start, count

trips
  id PK, name, description, base_currency CHAR(3), start_date, end_date,
  created_by FK→users, status ENUM(active, completed, archived),
  completed_at, version INT, created_at, updated_at

trip_members
  id PK, trip_id FK, user_id FK, role ENUM(owner, member), joined_at, left_at
  UNIQUE (trip_id, user_id)

invitations
  id PK, trip_id FK, token_hash UNIQUE, created_by FK, expires_at NULL,
  max_uses NULL, usage_count INT DEFAULT 0, revoked_at NULL, created_at
  INDEX (trip_id)

trip_fx_rates                    -- optional trip-fixed rate per currency
  trip_id FK, currency CHAR(3), rate NUMERIC(24,12), set_by FK, set_at
  PK (trip_id, currency)

fx_rate_cache                    -- daily API rates
  base CHAR(3), quote CHAR(3), rate_date DATE, rate NUMERIC(24,12), fetched_at
  PK (base, quote, rate_date)

expenses
  id PK, trip_id FK, client_id UUID, description, notes,
  original_amount BIGINT CHECK (> 0), original_currency CHAR(3),
  base_currency CHAR(3), exchange_rate NUMERIC(24,12) CHECK (> 0),
  rate_source ENUM(same_currency, api, trip_fixed, manual, offline_cached),
  rate_date DATE, base_amount BIGINT CHECK (> 0),
  split_type ENUM(equal, exact, percentage, shares),
  expense_date DATE, created_by FK, version INT, payload_hash,
  deleted_at NULL, deleted_by NULL, created_at, updated_at
  UNIQUE (trip_id, client_id)
  INDEX (trip_id, deleted_at, expense_date)

expense_payers
  expense_id FK, user_id FK, amount_original BIGINT, amount_base BIGINT
  PK (expense_id, user_id)

expense_splits
  expense_id FK, user_id FK,
  share_original BIGINT, share_base BIGINT,
  input_percentage_bp INT NULL,   -- basis points, 10000 = 100%
  input_shares INT NULL,
  input_amount BIGINT NULL
  PK (expense_id, user_id)

expense_revisions               -- immutable audit trail
  id PK, expense_id FK, version INT, action ENUM(create, update, delete),
  snapshot JSONB, actor_user_id FK, created_at
  UNIQUE (expense_id, version)

settlement_plans
  id PK, trip_id FK, version INT, algorithm ENUM(exact_dp, heuristic),
  is_proven_optimal BOOL, transfer_count INT, balances_snapshot JSONB,
  created_by FK, created_at, superseded_at NULL
  UNIQUE (trip_id, version)

settlements
  id PK, plan_id FK, trip_id FK, from_user_id FK, to_user_id FK,
  amount BIGINT CHECK (> 0), currency CHAR(3),
  status ENUM(pending, sent, confirmed, disputed, cancelled),
  version INT, created_at, updated_at
  CHECK (from_user_id <> to_user_id)
  INDEX (trip_id, status)

settlement_events
  id PK, settlement_id FK, actor_user_id FK, from_status, to_status,
  note NULL, created_at
```

Notes:
- The spec's `ExpenseSyncRecords` table isn't needed: `UNIQUE (trip_id, client_id)` + `payload_hash` give idempotency directly.
- Edits create a new `expense_revisions` row and bump `version`. Deletes are soft (`deleted_at`). History is never destroyed.
- Every write that affects money runs in a transaction that first takes `SELECT … FOR UPDATE` on the trip row. That serialises it against completing the trip or generating a plan.

---

## 6. API specification (`/api/v1`, JSON, cookie session)

All mutating requests require same-origin `Origin` header + `X-Requested-With: ncc` (CSRF defence on top of SameSite).

**Auth**
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{username, password, displayName}` → sets session, returns **one-time recovery code** |
| POST | `/auth/login` | rate-limited per IP and per username |
| POST | `/auth/logout` | revokes session |
| GET | `/auth/me` | |
| POST | `/auth/recover` | `{username, recoveryCode, newPassword}` → new session + **new** recovery code |
| POST | `/auth/recovery-code` | regenerate (requires password) |
| POST | `/auth/password` | change password |

**Trips & members**
| Method | Path | Notes |
|---|---|---|
| GET | `/trips` | mine, grouped by status |
| POST | `/trips` | creator becomes owner |
| GET | `/trips/:id` | incl. members |
| GET | `/trips/:id/snapshot` | everything for offline cache, ETag |
| PATCH | `/trips/:id` | owner; base currency locked once any expense exists |
| POST | `/trips/:id/complete` | owner; locks expenses, generates settlement plan |
| POST | `/trips/:id/reopen` | owner; only if no transfer is `sent`; supersedes pending transfers |
| POST | `/trips/:id/archive` | owner |
| PUT | `/trips/:id/fx-rates/:currency` | owner; set trip-fixed rate |

**Invitations**
| Method | Path | Notes |
|---|---|---|
| GET | `/trips/:id/invitations` | owner |
| POST | `/trips/:id/invitations` | `{expiresAt?, maxUses?}` → URL with raw token (shown once; DB stores hash) |
| DELETE | `/invitations/:id` | revoke |
| GET | `/invites/:token` | public preview: trip name, owner display name, member count, valid? |
| POST | `/invites/:token/join` | logged in; idempotent if already a member |

**Expenses**
| Method | Path | Notes |
|---|---|---|
| GET | `/trips/:id/expenses` | |
| POST | `/trips/:id/expenses` | idempotent by `clientId` (§4.3) |
| GET | `/expenses/:id` | |
| PUT | `/expenses/:id` | `If-Match: version` |
| DELETE | `/expenses/:id` | `If-Match: version`, soft delete |
| GET | `/expenses/:id/revisions` | audit trail |
| GET | `/fx/rate?from=THB&to=SGD&date=2027-04-02` | server-cached Frankfurter rate |

**Balances & settlement**
| Method | Path | Notes |
|---|---|---|
| GET | `/trips/:id/balances` | per member: paid, share, transfers in/out, net |
| GET | `/trips/:id/settlement` | current plan + statuses + progress |
| POST | `/settlements/:id/sent` | debtor only |
| POST | `/settlements/:id/confirm` | **creditor only** |
| POST | `/settlements/:id/dispute` | creditor only, optional note |
| POST | `/settlements/:id/cancel` | owner (e.g. settled in cash another way, then plan regenerates) |

Errors use a consistent shape: `{ error: { code, message, details? } }`. Codes include `VALIDATION`, `CONFLICT`, `NOT_MEMBER`, `TRIP_LOCKED`, `RATE_LIMITED`.

---

## 7. Auth design

- Argon2id (memory ≈ 19 MiB, t=2, p=1, the OWASP minimum, tuned to the host).
- Session token: 32 random bytes, sent as an httpOnly cookie, stored **hashed** (SHA-256) in `sessions`. 90-day sliding expiry, because re-logging into an installed PWA is painful.
- Recovery code: 16 random chars in groups (`XXXX-XXXX-XXXX-XXXX`), shown once at registration with a "copy / I've saved it" step, Argon2id-hashed. Using it rotates it and revokes all other sessions.
- Rate limit: 5 failed logins / 15 min per username, 20 / 15 min per IP, stored in Postgres.
- Usernames are case-insensitive (CITEXT), 3–24 chars `[a-z0-9_.]`.

---

## 8. Financial engine (`packages/core`)

### 8.1 Money & currencies
- `Money = { minor: bigint, currency: 'SGD' | ... }`. There's an explicit currency table with decimals (SGD/MYR/USD/EUR/THB/CNY = 2; JPY/KRW/IDR/VND = 0).
- Float `number` is **never** used for amounts. Lint rule + tests guard the core package.

### 8.2 Conversion (one rate per expense)
1. `baseTotal = roundHalfEven(originalTotal × rate × 10^(baseDecimals − originalDecimals))`, computed with `big.js`.
2. Payers' and splits' base amounts are **not** converted one by one, because that causes cent drift. Instead `baseTotal` is **allocated** in proportion to their original amounts using the *largest remainder method*.
3. Result: `Σ payers_base = Σ splits_base = baseTotal` **exactly**, every time.

### 8.3 Split methods (all produce integer `share_original` that sum exactly to the total)
| Type | Input | Allocation |
|---|---|---|
| Equal | participants | `total / n`, remainder units handed out one each |
| Exact | amount per person | must sum to total, otherwise reject |
| Percentage | basis points per person (2-dp %) | must sum to 10000; largest remainder |
| Shares | positive integer weights | largest remainder |

**Deterministic tie-break** for leftover cents: largest fractional remainder first, then member join order, then user id. Identical input always gives identical output on client and server.

### 8.4 Ledger & balances
```
net(u) = Σ paid_base(u) − Σ share_base(u)                   over non-deleted expenses
       + Σ confirmed transfers sent by u − Σ confirmed transfers received by u
```
- Invariant checked on every write and every read in tests: `Σ net(u) = 0`.
- Settled-in-app transfers count only when **confirmed**. So when everything is confirmed, every net is exactly 0 (acceptance step 22).

---

## 9. Exact minimum-transfer settlement

### 9.1 The maths
Let the non-zero balances be `b₁…bₙ` (integers, Σ = 0).
Any settlement forms a graph. Each connected component must itself sum to zero, and a component of size *s* needs at least *s − 1* transfers.
So **minimum transfers = n − k**, where *k* is the **largest number of disjoint zero-sum groups** the people can be partitioned into.
Each zero-sum group of size *s* can always be settled in exactly *s − 1* transfers.

### 9.2 Algorithm: subset DP, O(2ⁿ · n) time, O(2ⁿ) memory
```
sum[mask]  = Σ b_i for i in mask                  (built incrementally, O(2ⁿ))
dp[0] = 0
dp[mask] = max_{i ∈ mask} dp[mask \ {i}]  +  (sum[mask] == 0 ? 1 : 0)
k = dp[full];  minTransfers = n − k
```
- **Reconstruct groups:** walk back from `full`, always removing the *lowest-index* element that keeps the optimum (deterministic). Each time the remaining mask sums to zero, the removed elements since the last cut form one group.
- **Inside each group:** sort creditors and debtors by amount desc, then user id. Two-pointer match → exactly *s − 1* transfers. It can't be fewer, otherwise the group would split into smaller zero-sum groups, contradicting maximal *k*.
- Each debtor pays exactly what they owe, each creditor receives exactly what they're owed, and everything is in the base currency.

### 9.3 Supported sizes & fallback
| Non-zero balances *n* | Method | Cost (approx.) | Label in UI |
|---|---|---|---|
| ≤ 20 | Exact DP | ~2×10⁷ steps, well under 1s; 1M-entry typed arrays | **"Minimum possible: X transfers"** |
| > 20 | Heuristic: cancel equal-and-opposite pairs → search small zero-sum groups (size ≤ 4) → greedy for the rest | fast | **"X transfers (efficient, not proven minimal)"** |

People with a zero balance don't count toward *n*, so a 25-person trip can still be exact.
The plan records `algorithm` and `is_proven_optimal`, and the UI **never** claims optimality unless `exact_dp` ran.

### 9.4 Tests
- Brute force (try every partition) vs DP on thousands of random small cases (fast-check): same `k`.
- Greedy counterexamples found automatically by the property test and frozen as fixtures.
- Invariants on every plan: amounts > 0, no self-transfers, every balance reaches 0, transfer count = n − k.
- Performance: n = 20 under 1s in CI.

### 9.5 Settlement lifecycle
- **Complete trip** → expenses locked → plan v1 generated from current nets.
- Transfer states: `pending → sent` (debtor) `→ confirmed` (creditor, terminal); `sent → disputed` (creditor) `→ sent` (debtor re-marks); `pending/disputed → cancelled` (owner).
- Progress: "3 of 5 transfers confirmed". **Fully settled** = every non-cancelled transfer in the current plan is confirmed **and** every net balance is 0. Generating a plan alone never counts as settled.
- **Reopen** (owner): blocked while any transfer is `sent`. Pending transfers are superseded. Confirmed ones stay and count in the ledger. Completing again creates plan v2 from what's left to settle.

---

## 10. Contradictions & risky requirements found in the spec

1. **"Unequal" vs "Exact amount" split** describe the same thing. They're merged (§0).
2. **Multi-payer currencies**: the spec's `ExpensePayers.currency` column implies payers could use different currencies on one expense. That's complex and rare, so it's simplified to the expense's currency (§0).
3. **"Installable via Safari" + "invite link joins the trip"**: on iOS the link always opens in Safari, which has storage separate from the installed app. Handled with the Paste-invite flow (§3.5), but the acceptance scenario will involve logging in twice on iOS. That's a platform limit.
4. **"Sync when connectivity returns" on iOS**: there's no background sync, so it happens when the app is opened or foregrounded (§3.5).
5. **Offline FX**: live rates can't be fetched offline. Handled with labelled cached/manual rates (D3).
6. **"Edit expenses" + "complete trip"**: the spec is silent on editing after completion. Completing locks expenses and reopening is explicit (§9.5).
7. **Member removal** isn't specified, but "history intact" is required. No removal once involved (§0).
8. **Exact optimality is exponential.** Exact up to 20 non-zero balances, labelled heuristic above that (§9.3).
9. **"Test on installed iOS PWA"**: this can't be automated in CI. Playwright WebKit covers the engine. Real-device runs use a manual checklist in `docs/TESTING.md`.
10. **IDR / JPY decimals**: 0 decimals is chosen for practicality (§0).
11. **Changing base currency** after expenses exist would silently re-value history, so it's locked once the first expense exists.

---

## 11. Milestones

Each phase ends with something runnable and deployed to a staging URL.

| Phase | Deliverable | Exit check |
|---|---|---|
| **1. Foundation + PWA shell** | Monorepo, Vite/React/Tailwind, Hono, Postgres/Drizzle, brand lockup, manifest, icons, iOS splash, SW + update toast, install prompts, CSP, Docker, CI | **Installable on iPhone & Android, opens offline, update toast works**. Lighthouse PWA checks pass |
| **2. Auth & trips** | Register/login/recovery, sessions, rate-limit, trips, members, invites (link, QR, share sheet, revoke, expiry, limits), join flow incl. paste-invite | e2e: Alice creates trip, Bob joins via link |
| **3. Financial core (tests first)** | `packages/core`: money, currencies, allocation, splits, FX conversion, ledger; full unit + property tests | 100% branch coverage on core |
| **4. Expenses** | Add/edit/delete, all splits, multi-payer, multi-currency, Frankfurter + trip-fixed + manual rates, revisions, balances screen | Ledger reconciles to 0 across random e2e data |
| **5. Settlement optimiser** | Exact DP + fallback, plan generation on complete, Settle Up UI | Optimality property tests green; n=20 < 1s |
| **6. Settlement tracking** | Sent/confirm/dispute/cancel, events, progress, reopen, final summary | Acceptance steps 15–24 pass |
| **7. Offline data** | Dexie store, snapshots, outbox, sync engine, conflict UI, logout isolation, storage persist | Playwright offline suite: create offline → reload → reconnect → synced exactly once |
| **8. Polish & ship** | Mobile UI refinement, a11y pass, security + financial review, real-device checklist, prod deploy, README/DEPLOY docs | Full acceptance scenario on a real iPhone + Android |

(The PWA shell is built in phase 1 as the spec requires. Offline *data* sync is phase 7, also as the spec says. Expense screens are designed from day one to read from the local store, so phase 7 doesn't need a rewrite.)

---

## 12. Constraints of the current Claude session (not of the app)

- Package installs (npm/pnpm) are blocked in this session's network settings. Until that's enabled, I can write code and push it but **can't install dependencies, build or run tests** here. CI on GitHub Actions can still run them.
