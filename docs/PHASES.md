# Phases

| Phase | What | Status | Version |
|---|---|---|---|
| 1 | Foundation + installable PWA shell | ✅ Done | 0.1.0 |
| 2 | Accounts, trips, invite links + QR | ✅ Done | 0.2.0 |
| 3 | Financial engine (exact money, splits, ledger) | ✅ Done | 0.3.0 |
| 4 | Expenses, currencies, balances, trip deletion, profile photos | ✅ Done | 0.4.0 – 0.4.1 |
| 5 | Settle up: minimum-transfer plan, finish/reopen trip | ✅ Done | 0.5.0 |
| 6 | Transfer tracking: sent / confirmed / disputed, fully settled | ✅ Done | 0.6.0 – 0.6.2 · **MVP** |
| 7 | Offline viewing: last-loaded trips with "last updated" time | ✅ Done | 0.7.0 |
| 8 | Release: polish, security + money review, real-device testing, final docs | ✅ Done (real-phone checklist pending) | 1.0.0-rc.1 |
| — | Fresh start + admin, test report run 2 fixes | ✅ Done | 1.1.0 |
| — | Admin users list (users and their trips) | ✅ Done | 1.2.0 |
| — | Expense categories + filter, admin permanent delete | ✅ Done | 1.3.0 |
| — | Supporter status, Invite a friend, admin supporter controls | ✅ Done | 1.4.0 |
| — | Become a Supporter page (PayNow QR + reference, Telegram) | ✅ Done | 1.5.0 |
| — | Admin: disable accounts (read-only), Disabled folder | ✅ Done | 1.6.0 |
| — | Renamed to ChickAA · 别鸡较 | ✅ Done | 1.7.0 |
| — | Supporter extras (exports, trip recap, receipt photos) + PayNow | ⏳ Later | — |

## 1 · Foundation + PWA shell
Project setup, brand (ChickAA / 别鸡较 and the chick icon), installable app with icons and iPhone launch screens, offline app shell, update prompt, install instructions, security headers, Docker, automated tests and CI.

## 2 · Accounts and trips
Sign-up without email or phone, recovery codes, log in/out, password reset, trips with base currency, members, invite links with QR codes, expiry and usage limits, and the join flow. The server is woken in the background when the app opens.

## 3 · Financial engine
The shared calculation core: exact whole-cent money, exchange-rate conversion, cent-perfect rounding, all split methods, multiple payers and balances. It's covered by thousands of randomised tests that check every cent reconciles.

## 4 · Expenses
Add, edit and delete expenses in any of 17 currencies (daily rate, trip-fixed rate or your own), every split method, several payers, live per-person preview, duplicate-safe saving, change history, balances, and the trip dashboard. Also: owner can delete a fully settled trip, and profile photos shrunk to a few KB.

## 5 · Settle up
The fewest-transfers plan (proven minimum for up to 20 people with something owing), live preview, finishing a trip (locks expenses and saves the plan), reopening a trip.

## 6 · Transfer tracking (MVP)
*I've sent it* (payer), *Got it* / *Not received* (recipient), cancel (owner), progress, transfer history, "All settled" state and the trip summary.

## 7 · Offline viewing
Trips, expenses, balances, who owes who and the settle-up plan viewable with no signal, with a "last updated" time. Trips are downloaded in the background. Changes are disabled offline. The offline copy is per user and wiped on log out.

## 8 · Release
Security and financial-integrity review ([SECURITY.md](SECURITY.md)) with hardening: request-size limits, trusted client IPs for rate limiting, settle-up plans independently re-verified before saving, overflow guard, session and rate-limit cleanup. Final technical docs: architecture as built, deploy, testing, known limitations.

**To reach 1.0.0:** run the real-phone checklist in [TESTING.md](TESTING.md) on an iPhone and an Android phone (installed app). That's the one step that can't be automated.
