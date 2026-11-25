# Testing

## Automated

| Suite | Command | Covers |
|---|---|---|
| Unit (Vitest) | `pnpm test` | currencies, platform detection, API health, CSRF guard, static serving, cache headers, security headers |
| E2E (Playwright) | `pnpm build && pnpm test:e2e` | manifest validity + icon sizes, iOS tags + launch screens, **Chrome installability (zero errors)**, SW registration, **offline launch on any route**, no API data in Cache Storage, **update prompt → Refresh activates new version**, brand hierarchy, no horizontal scroll, no CSP violations |

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

### Android, Chrome
- [ ] Install card shows **Install app** button → native install dialog → icon on home screen (round mask looks right)
- [ ] Launches standalone with orange status bar
- [ ] Airplane mode → reopen: works offline with banner
- [ ] Update prompt as above

### Desktop Chrome / Edge
- [ ] Install icon in address bar; installed window opens without browser UI
