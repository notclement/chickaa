# Testing

## Automated

| Suite | Command | Covers |
|---|---|---|
| Unit + integration (Vitest) | `pnpm test` (integration tests need `DATABASE_URL`) | currencies, platform detection, link parsing, API health/ping, CSRF guard, static serving, cache + security headers; **auth** (register, Argon2id storage, login/logout, session revocation, rate limiting, recovery codes, password change), **trips** (create, validation, privacy, owner-only edits, base-currency lock), **invites** (hashed tokens, preview, join, no duplicate members, max uses under concurrency, expiry, revoke, closed trips) |
| E2E (Playwright) | `pnpm build && pnpm test:e2e` | **register → trip → invite link + QR → friend joins**, logout/login, password reset with recovery code, redirect-after-login, bad invite links; manifest validity + icon sizes, iOS tags + launch screens, **Chrome installability (zero errors)**, SW registration, **offline launch on any route**, no API data in Cache Storage, **update prompt → Refresh activates new version**, brand hierarchy, no horizontal scroll, no CSP violations |

E2E runs as an Android phone (Pixel 7) and desktop Chrome. Set `CHROME_PATH` to use an installed Chrome
instead of Playwright's bundled Chromium. CI runs everything on each push (`.github/workflows/ci.yml`).

## Real-device checklist (can't be automated)

Run on the staging URL after each phase. ✅ = pass.

### iPhone, Safari (iOS 17+)
- [ ] Home page loads, no horizontal scroll, text readable, nothing under the notch
- [ ] Install card shows the 3 **Share → Add to Home Screen** steps
- [ ] Add to Home Screen: icon is the chick on orange, name "NoChickenCall"
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

### Android, Chrome
- [ ] Install card shows **Install app** button → native install dialog → icon on home screen (round mask looks right)
- [ ] Launches standalone with orange status bar
- [ ] Airplane mode → reopen: works offline with banner
- [ ] Update prompt as above

### Desktop Chrome / Edge
- [ ] Install icon in address bar; installed window opens without browser UI
