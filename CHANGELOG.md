# Changelog

All notable changes to ChickAA. Dates are Singapore time.

## [1.8.0] - 2026-11-27 · Test report run 3 fixes
### Fixed
- **F1 Rate limits can't be dodged with a fake IP header.** `true-client-ip` is no longer trusted. On Render (behind Cloudflare) the IP comes from `cf-connecting-ip`, which Cloudflare sets itself; elsewhere from the last `x-forwarded-for` hop. `TRUST_CLOUDFLARE` overrides the automatic choice.
- **F2 Leftover cents are spread around.** When a split doesn't divide evenly, who gets the odd cent now rotates per expense (from the expense's own ID) instead of always the first member, so long trips no longer drift against the owner. Existing expenses keep their cents; an edit that doesn't change the money never moves a cent.
- **F3 Real names are no longer "reserved".** benjamin, amin, jasmine, yasmin, armin, model, sudoku, rootbeer, supportive… are allowed. Look-alikes are still blocked: the typo check runs on the whole ID, and short words (mod, root, team, support…) only as a whole word or with digits/separators (mod1, mod_sg). `adnim` is now caught.
- **F4 The owner can't wipe a debt between two other people.** "Settled another way…" on someone else's payment now waits for the person being paid to accept it (**Got it**) or refuse it (**Not received**). It's instant only when the owner is the one being paid. The row shows who marked it.
- **F5/F6 Disabled accounts.** No add, edit or delete may move a disabled person's balance (so deleting an old expense can't give them a debt again), but edits that leave their part alone (e.g. a new description) now work.
- **F7 Typed exchange rates.** The server refuses a rate more than 10× off the published rate for that date unless you ticked "this rate is right" (then up to 100×). The warning now says "the rate for <date>", not "today's rate".
- **F8 Invisible characters** (zero-width spaces, right-to-left overrides…) are removed from display names, trip names, descriptions and notes. Emoji keep working.
- **F9 Better category guesses.** Phrases and ticket words win ("Water park tickets" → Activities, "Night market dinner", "Room service dinner", "Grab food delivery" → Food); "transfer" alone is no longer Transport; plus pho, banh mi, izakaya, durian, ice cream, onsen, 夜市 and more SEA/Japan words.
- **F10 One meaning for "Active".** The trip screen shows the same colour tag as Admin (Active / On-going / Needs finishing / Pending settlement / Ended). The trip list headings are now "Current trips" and "Finished".

### Performance
- Splitting an expense is slightly faster than before (no sorting when the amount divides exactly); ID checks are ~35% faster. The app download grows by about 1 KB gzipped (the extra category words).

## [1.7.1] - 2026-11-26 · Find people by ref code
### Changed
- **Admin → Users** shows everyone's ref code (`CHICKAA-` + the code in big orange letters). Every account gets one at sign-up.
- Search updates as you type and matches anywhere in a name, ID or ref code (ignoring case, dashes and spaces), with the matching part of the code highlighted.

## [1.7.0] - 2026-11-26 · New name: ChickAA
### Changed
- **New name: ChickAA** (AA制 is Chinese slang for going dutch), with the Chinese name **别鸡较** (bié jī jiào: 别计较 "don't squabble over every cent", with 鸡 for chicken). Same chick, same colours, same link; accounts and trips are unchanged.
- Internal names (package scope, storage keys, session cookie, PayNow reference prefix `CHICKAA-`) follow the new name; everyone signs in once more after this update.
- Installed apps pick up the new name on Android/desktop automatically; on iPhone the home-screen label updates if you remove and re-add the app.
- Under the name: **别鸡较 · split bills with friends**.
- `chickaa` look-alike IDs are reserved.

## [1.6.0] - 2026-11-26 · Disable accounts
### Added
- **Admin: disable an account** (Users → tap a person → Disable account…, optional private note). Only possible once they're settled in every trip. Disabled accounts move to a **🚫 Disabled** folder and can be enabled again.
- A disabled person can still sign in and **view** their trips, but nothing else: no new trips, joining, expenses, payments, profile, photo or password changes (password recovery too). Every screen shows **"Account disabled. PM @mashpotatas on Telegram to figure out why."**
- Trips with a disabled member **can't be reopened**; the owner sees who (display name and @ID) and is pointed to @mashpotatas. Disabled people also can't be added to new or edited expenses.

## [1.5.0] - 2026-11-26 · Become a Supporter (PayNow)
### Added
- **Become a Supporter** (Account → 💛 Support): a one-off S$5 by PayNow for lifetime Supporter.
  - Shows the PayNow QR with **your own reference** (`CHICKAA-XXXXXXXX`) built in, plus Copy reference and Save QR (for paying on the same phone).
  - Then one tap opens **Telegram to @mashpotatas** with a ready-made thank-you message and the reference; the admin switches on Lifetime.
  - The QR's PayNow details come from the server setting `PAYNOW_QR_PAYLOAD`, not the code.
- **Admin → Users:** each person's PayNow reference; search by reference.
- **What Supporters get** list on the Supporter and Invite a friend pages: badge (now); PDF/CSV export, trip recap, receipt photos, early access (coming soon).

## [1.4.0] - 2026-11-26 · Supporter + Invite a friend
### Added
- **💛 Supporter** status: a month at a time or lifetime. Shown as a badge on Account. Nothing is paywalled yet; everything stays free.
- **Invite a friend** (Account): a personal link (`/r/<code>`). When a friend creates an account with it, **you both get 1 month as Supporter**. More friends stack more months (up to 12 months ahead).
- **Admin → Users:** Supporter status, who invited them and how many they invited; buttons for **+1 month**, **Lifetime** and **Remove**.

## [1.3.0] - 2026-11-26 · Categories
### Added
- **Expense categories:** 🍜 Food & drinks · 🚕 Transport · 🏨 Stay · 🎟️ Activities · 🛍️ Shopping · 🛒 Groceries · 🧾 Fees & bills · 💵 Cash / loan · 📦 Other. Picked automatically from the description (English, Singlish and Chinese keywords) until you choose one; shown as the expense's icon.
- **Filter by category** on the Expenses list, with the category total.
- **Admin: delete permanently** any trip (e.g. test trips) after typing its name. Removes everything in it for everyone.

### Note
- Expenses added before this version are in **Other**; edit one to change it.

## [1.2.0] - 2026-11-26 · Admin users list
### Added
- **Admin → Users tab:** every account (display name, @ID, joined date, last active, Admin badge), searchable, each expanding to the trips they own or belong to with the trip's status tag, owner/member role and whether they left. Tap a trip to open it (read-only unless you're a member).
- **Developer credit:** "Made by Clement · LinkedIn" on the Account screen and the login / sign-up screens.

## [1.1.0] - 2026-11-26 · Fresh start + admin
### ⚠️ Data reset
- **The database is wiped once when this version deploys.** All accounts, trips, expenses and settlements are deleted (exchange-rate cache kept). Everyone signs up again.

### Added
- **Admin:** the reserved ID `admin` can only be created with a one-time code stored privately on the server (`ADMIN_SETUP_CODE`). The admin sees **all trips** with colour-coded status tags and can open any trip **read-only** (normal rights in trips they're a member of).
- **Trip status tags:** 🔵 Active (created, no transactions yet) · 🟢 On-going (within the trip dates or has transactions) · 🟣 Needs finishing (end date passed, not finished) · 🟠 Pending settlement (finished, payments open) · ⚪ Ended (fully settled) · 🔴 Deleted.
- **Reserved user IDs:** look-alike admin/staff IDs are refused (adm1n, 4dmin, a_d_m_i_n, admn, amdin, administrator, root, sysadmin, moderator, support, official, chickaa… including number-for-letter swaps and one-letter typos).
- Sign-up and Account explain that the **User ID is for logging in and can't be changed**, while the **display name** is what friends see and can change any time.
- **Settled another way** (owner): mark a transfer as paid outside the app (cash, swapped debts) with a note. It counts as paid.
- **Paid earlier:** payments confirmed before a trip was reopened stay listed on Settle up and in the trip summary.
- Recipients can confirm a payment after saying "Not received" if the money turns up.
- Warnings: a typed exchange rate more than 20% away from the day's rate must be confirmed (more than 100× off is refused); dates in the future or outside the trip's dates show a note.
- Settle up explains that you may pay someone other than the person who paid for your share.

### Fixed (test report run 2)
- B1: the owner's "Cancel" left a debt open forever. Replaced by **Settled another way**.
- B2: impossible dates (e.g. 2026-02-30) now give a clear error instead of "Something went wrong".
- B3: earlier payments no longer disappear after Reopen → Finish.
- B4: wrong passwords from one device can no longer lock the real owner out (limit is now per user ID + network).
- B5: Balances screen no longer says settling up is "coming soon"; it links to Settle up.
- B6: rejected oversized uploads close the connection cleanly.
- U4: expired/revoked invite links no longer show the trip's name, owner or size.
- U5: Chinese yuan shows as **CN¥** (JPY stays ¥).
- U6: avatars for CJK names show one character, so they fit the circle.
- U7: 0-amount rows in an "Amounts" split are dropped.
- U8: only successful sign-ups count towards the per-network limit (now 50/hour), so typos on shared Wi-Fi don't block a group.
- O5: transfers always list in the same order.
- O6: large lists are compressed (≈10× smaller downloads).

## [1.0.0-rc.1] - 2026-11-26 · Phase 8 (release candidate)
Becomes 1.0.0 once the real-phone checklist in docs/TESTING.md passes.
### Security
- Request bodies capped at 64 KB.
- Rate limiting uses the client IP set by the hosting edge / last proxy hop, not a client-supplied header.
- Expired/revoked sessions and old rate-limit records are cleaned up automatically.
- Production dependencies audited: no known vulnerabilities.
### Fixed
- Settle-up plans are independently re-checked to settle every balance to the cent before they're saved.
- Extremely large totals can no longer overflow the optimiser; they use the verified fallback plan.
### Docs
- New **SECURITY.md** (security + financial-integrity review). Final ARCHITECTURE (as built, known limitations), DEPLOY and TESTING.

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
- Brand: app name with its Chinese name underneath, chick icon.
