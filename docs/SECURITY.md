# Security & financial-integrity review (v1.1.0)

Reviewed in Phase 8 against SPEC §3.7 and §18. ✅ = in place and covered by automated tests.

## Accounts and sessions
| Control | Status |
|---|---|
| Passwords and recovery codes hashed with **Argon2id** (19 MiB, t=2), never stored or logged in plain text | ✅ |
| Same error for unknown user vs wrong password, with equal timing (dummy hash) | ✅ |
| Rate limits (Postgres): login 8 / 15 min per **user ID + IP** (a stranger can't lock someone out), 100 / 15 min per user ID, 30 per IP; recovery 5 / h per user; **successful** sign-ups 50 / h per IP; admin setup 5 / h per IP; avatar 30 / h | ✅ |
| Client IP for limits from edge headers or the **last** X-Forwarded-For hop (the first hop is client-controlled) | ✅ |
| Session = 32 random bytes in an **httpOnly, Secure, SameSite=Lax `__Host-` cookie**; only the SHA-256 is stored; 90-day sliding expiry | ✅ |
| Logout revokes server-side; password change signs out other devices; recovery signs out all and rotates the code | ✅ |
| Nothing auth-related in localStorage/IndexedDB (only the display profile) | ✅ |
| Old sessions and rate-limit rows cleaned up every 6 h | ✅ |

| Admin account `admin` only creatable with the private one-time `ADMIN_SETUP_CODE` (constant-time compare); look-alike admin/staff IDs reserved for everyone | ✅ |
| Admin can **read** any trip; all writes still require trip membership | ✅ |

## Web and API
| Control | Status |
|---|---|
| HTTPS only (Render), **HSTS** in production | ✅ |
| Strict **CSP** (`default-src 'self'`, no inline scripts/styles), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP | ✅ |
| **CSRF**: writes need same-origin `Origin` + `X-Requested-With: ncc`, on top of SameSite cookies | ✅ |
| Request bodies capped at 64 KB (photos at 24 KB, checked by magic bytes, JPEG/WebP only, no SVG); oversized requests close the connection | ✅ |
| Real calendar dates enforced everywhere (no DB errors from 2026-02-30) | ✅ |
| Typed exchange rates > 100× off the official rate refused (fat-finger guard) | ✅ |
| Input validation with shared zod schemas; malformed ids are 404 (no DB errors) | ✅ |
| **Access control**: every trip/expense/settlement/avatar read and write checks membership; non-members get 404 (no probing); owner-only and payer/recipient-only actions enforced server-side | ✅ |
| Invite tokens: 192-bit random, only SHA-256 stored, expiry, max uses (row-locked), revocation; dead links reveal nothing about the trip | ✅ |
| User data never in shared HTTP caches (`no-store`); avatars `private` + versioned | ✅ |
| Service worker never caches API responses; offline copy is per user and **deleted on logout / expiry / user switch** | ✅ |
| Production dependencies: `pnpm audit --prod` reports no known vulnerabilities (26 Nov 2026) | ✅ |
| React escapes output; the only raw HTML is the locally generated QR SVG | ✅ |

## Financial integrity
| Rule (SPEC §18) | How |
|---|---|
| Integer minor units, never floats | `bigint` everywhere in `packages/core`; a test fails the build if float helpers appear |
| Splits and payers reconcile to the expense total (original and base currency) | Allocation from one converted total (largest remainder); property tests over thousands of random expenses |
| Net balances sum to zero | Checked on every balance calculation |
| Settlement transfers reconcile with balances | Plan is **independently re-verified** (`verifySettlement`) before it's stored; brute-force cross-checks in tests |
| Historical rates never change | Rate stored per expense; cached provider rates are permanent; edits keep the original rate |
| History preserved | Soft deletes, expense revisions, settlement events, superseded plans kept |
| Duplicate requests | Expense `clientId` + payload hash (unique per trip); settlement actions idempotent and row-locked |
| Concurrent edits | Optimistic versions (409 with the current copy); trip row locked for money-affecting writes |
| Settled ≠ planned | "Fully settled" requires every transfer **confirmed by its recipient** and all balances at zero |
| No 64-bit overflow in the optimiser | Very large totals skip the 64-bit DP and use the verified heuristic |

## Accepted risks
- Usernames can be checked for availability at sign-up (inherent to username accounts).
- Anyone holding a **valid** invite link sees the trip name, owner name and member count before joining (by design).
- The admin ID (`admin`) is public in the repo; it's protected by the private one-time code, which is useless once the account exists.
- No email/phone means a lost password **and** lost recovery code can't be recovered.

## Reporting
Open a private security advisory on the GitHub repo (Security → Report a vulnerability).
