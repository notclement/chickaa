# Changelog

All notable changes to NoChickenCall. Dates are Singapore time.

## [0.7.0] - 2026-11-26 · Phase 7
### Added
- **Offline viewing:** with no signal, the app still shows your trips, expenses, balances, who owes who and the settle-up plan as last loaded, with an **“Offline · view only · Last updated 3:42 pm”** banner.
- Trips on *My trips* are downloaded in the background (while online), so they can be viewed offline even if not opened recently.
- If you were logged in, the app opens straight into offline mode instead of a “can’t reach” screen.
### Changed
- Anything that changes data (add/edit/delete, invite, finish, mark sent/received) is disabled offline and says “needs a connection”.
### Security
- The offline copy is stored per user on the device and **deleted on log out**, when the session has expired, or when a different user signs in.

## [0.6.2] - 2026-11-26
Fixes from the 7-day, 4-person Okinawa test run (money logic verified: balances summed to S$0.00, minimum 3 transfers).
### Fixed
- Expense detail and edit screens no longer request `/api/v1/trips/undefined` (a 404) before the expense has loaded.
- Offline message now reads “You’re offline. Connect to the internet and try again.” instead of telling logged-in users to sign in.
- Exchange-rate inputs (Settings → Fixed exchange rates, and “Use my own rate”) show “Enter rate” instead of a THB-specific example number.
- Payers and people in a split are now always listed in the same order (member join order). Before, the database could return them in any order. Display only; amounts were never affected.

## [0.6.1] - 2026-11-26
### Added
- **Who owes who** on the trip page: a live, Splitwise-style list (e.g. "Bob owes Alice S$40.00") using the fewest transfers, always up to date while the trip is active. Once the trip is finished it shows each payment's status.

## [0.6.0] - 2026-11-26 · MVP
### Added
- Transfer tracking: **I've sent it** (payer), **Got it ✓** and **Not received** with a note (recipient), **Cancel** (owner).
- Settle-up progress ("3 of 5 transfers confirmed") and an **All settled** state once every transfer is confirmed and every balance is zero.
- Per-transfer history and a **trip summary** (total spent, each person before/after, transfers confirmed).
- Copy-amount button for pasting into banking apps.

## [0.5.0] - 2026-11-26
### Added
- **Settle up** screen with the fewest-transfers plan, labelled *Minimum possible* when proven.
- Owner can **finish** a trip (locks expenses, saves the plan) and **reopen** it (unpaid transfers recalculated, received ones kept).
- Settle-up entry on the trip page.

## [0.4.1] - 2026-11-26
### Added
- **Profile photos**, cropped and shrunk to about 5 KB on the phone before upload; visible only to trip-mates.

## [0.4.0] - 2026-11-26
### Added
- Add, edit and delete **expenses**: any of 17 currencies, daily exchange rate / trip-fixed rate / your own rate.
- Split equally, by amounts, by percentage or by shares; one or several payers; live per-person amounts.
- Expense list, expense details with change history, **balances** screen, trip dashboard with total and your balance.
- Owner can set **fixed exchange rates** for a trip.
- Owner can **delete a trip** once everyone is settled (type the name to confirm).
- App and server version shown in Account → App status.

## [0.3.0] - 2026-11-26
### Added
- Financial engine: exact whole-cent money, exchange-rate conversion with banker's rounding, cent-perfect allocation, all split methods, ledger balances.

## [0.2.0] - 2026-11-26
### Added
- Accounts without email or phone, one-time **recovery codes**, password reset and change.
- Trips, members, **invite links and QR codes** (expiry, usage limits, switch off), join flow.
- "Waking up the server…" notice and background wake-up when the app opens.
### Changed
- Hosting moved to Render (free) + Neon Postgres; keep-awake ping endpoint.

## [0.1.0] - 2026-11-26
### Added
- Installable PWA shell: icons, iPhone launch screens, offline launch, update prompt, install instructions.
- Brand: NoChickenCall with 别计较 underneath, chick icon.
