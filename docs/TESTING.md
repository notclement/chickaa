# Testing

As of v1.0.0-rc.1: 146 core + 61 API + 13 web unit/integration tests, 36 end-to-end runs (18 tests × Android phone + desktop Chrome), plus a live exchange-rate check in CI.

## Automated

| Suite | Command | Covers |
|---|---|---|
| Financial core (Vitest + fast-check) | `pnpm --filter @chickaa/core test` | money parsing/formatting (no float traps), exact FX conversion with banker’s rounding, largest-remainder allocation, all split methods, multi-payer expenses, cross-currency reconciliation, ledger balances (only confirmed transfers count), **property tests: thousands of random expenses always reconcile to the cent and balances always sum to zero**; a guard test fails if float helpers appear; coverage gate 100% lines |
| Unit + integration (Vitest) | `pnpm test` (integration tests need `DATABASE_URL`) | currencies, platform detection, link parsing, API health/ping, CSRF guard, static serving, cache + security headers; **auth** (register, Argon2id storage, login/logout, session revocation, rate limiting, recovery codes, password change), **trips** (create, validation, privacy, owner-only edits, base-currency lock), **invites** (hashed tokens, preview, join, no duplicate members, max uses under concurrency, expiry, revoke, closed trips) |
| E2E (Playwright) | `pnpm build && pnpm test:e2e` | **register → trip → invite link + QR → friend joins**, expenses (multi-payer, THB/manual rates, all splits, edit/delete, no `/trips/undefined` requests), who owes who, **settle up → sent → confirmed → all settled**, trip deletion rules, profile photo compression, **offline viewing + disabled writes + logout wipe + prefetch**, logout/login, password reset with recovery code, redirect-after-login, bad invite links; manifest validity + icon sizes, iOS tags + launch screens, **Chrome installability (zero errors)**, SW registration, **offline launch on any route**, no API data in Cache Storage, **update prompt → Refresh activates new version**, brand hierarchy, no horizontal scroll, no CSP violations |

E2E runs as an Android phone (Pixel 7) and desktop Chrome. Set `CHROME_PATH` to use an installed Chrome
instead of Playwright's bundled Chromium. CI runs everything on each push (`.github/workflows/ci.yml`).

## Real-device checklist (can't be automated)

Run on the staging URL after each phase. ✅ = pass.

### iPhone, Safari (iOS 17+)
- [ ] Home page loads, no horizontal scroll, text readable, nothing under the notch
- [ ] Install card shows the 3 **Share → Add to Home Screen** steps
- [ ] Add to Home Screen: icon is the chick on orange, name "ChickAA"
- [ ] Launch from home screen: orange/cream **launch screen**, then app opens **full-screen** (no Safari bars)
- [ ] App status says **Opened as: Home-screen app** and **Works without internet: Ready**
- [ ] Airplane mode → force-quit → reopen: app opens, **"Offline · view only"** banner shows
- [ ] Back online: banner disappears, Server/Database say Connected
- [ ] After a deploy: reopen app → **"New version ready"** → Refresh → version number changes

### Accounts & trips (Phase 2)
- [ ] Sign up in the **installed** app → recovery code screen → Save/Share works → lands on My trips
- [ ] Create a trip with dates; open it; Settings lets you rename it
- [ ] Invite people → QR shows → **Share…** opens the iOS share sheet (WhatsApp/Telegram listed)
- [ ] Friend scans the QR with the Camera app → join page in Safari → signs up → joins → sees “You’re in!”
- [ ] Friend opens the installed app afterwards → logs in once → trip is there
- [ ] Force-quit and reopen the installed app a day later → still logged in
- [ ] After 15+ min idle: open app → “Waking up the server…” appears briefly, then content loads

### Expenses (Phase 4)
- [ ] Add an expense in SGD with the decimal keyboard; total + your balance update
- [ ] Add one in THB/IDR: the rate appears with its date; “≈ S$…” matches; switch to “Use my own rate”
- [ ] Several payers: “left to assign” counts down to “✓ Adds up”
- [ ] Each split tab (Equally / Amounts / % / Shares) shows per-person amounts live
- [ ] Edit and delete an expense; history shows who did it
- [ ] Settings → set a fixed rate for a currency → new expenses in it say “Trip’s fixed rate”
- [ ] Settings → Delete trip is blocked while anyone owes, works once all are settled

### Settle up (Phases 5–6)
- [ ] Settle up preview shows who pays whom and “Minimum possible”
- [ ] Owner: Finish trip → expenses locked (no Add expense)
- [ ] Payer: Copy amount → pay in bank app → “I’ve sent it”
- [ ] Recipient: “Got it ✓” (and try “Not received” with a note on another transfer)
- [ ] Progress updates on both phones; last confirmation shows “🎉 All settled!”
- [ ] Owner: Reopen trip with an unpaid transfer → it’s recalculated after finishing again

### Offline (Phase 7)
- [ ] Open a trip, then turn on Airplane mode and force-quit the installed app
- [ ] Reopen: trips, the trip page, who owes who and settle up show with “Offline · view only · Last updated …”
- [ ] Add expense / Finish / I’ve sent it are greyed out (“needs a connection”)
- [ ] Turn Airplane mode off: banner disappears, buttons come back
- [ ] Log out and turn Airplane mode on again: nothing from the trip is shown

### Android, Chrome
- [ ] Install card shows **Install app** button → native install dialog → icon on home screen (round mask looks right)
- [ ] Launches standalone with orange status bar
- [ ] Airplane mode → reopen: works offline with banner
- [ ] Update prompt as above

### Desktop Chrome / Edge
- [ ] Install icon in address bar; installed window opens without browser UI
