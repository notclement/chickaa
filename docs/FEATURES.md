# Features

What NoChickenCall does as of **v1.6.0**. See [PHASES.md](PHASES.md) for what's next.

## Accounts
- Sign up with a **display name, user ID and password**. No email or phone number.
- The **user ID** is for logging in and is shown as @id. **It can't be changed.** The **display name** is what friends see and can be changed any time.
- IDs that look like admin or staff accounts (adm1n, administrator, root, support, typos and number-for-letter swaps) are reserved.
- A one-time **recovery code** is shown at sign-up. It's the only way to reset a forgotten password, and it changes every time it's used.
- Stay logged in for 90 days on each device.
- Change your name, password, recovery code and **profile photo** (shrunk to about 5 KB on your phone before upload).
- Repeated wrong passwords are slowed down (rate limiting).

## Trips
- Create a trip with a name, optional dates and description, and a **base currency** (17 currencies).
- The creator is the **owner**: they manage settings, invites, finishing the trip and deleting it.
- **Invite links + QR codes**, shared through your phone's share sheet (WhatsApp, Telegram, …). Links can expire, be limited to a number of people, or be switched off.
- Friends see the trip before signing up. Joining twice never adds them twice.
- The owner can **delete** a trip once everyone's balance is exactly zero, by typing the trip name to confirm.

## Expenses
- Any member can add an expense: amount, currency, description, category, date, notes.
- **Categories:** 🍜 Food & drinks · 🚕 Transport · 🏨 Stay · 🎟️ Activities · 🛍️ Shopping · 🛒 Groceries · 🧾 Fees & bills · 💵 Cash / loan · 📦 Other. Suggested from the description (English, Singlish and Chinese keywords); the expense list filters by category with a total.
- **Paid by** one person or several (with a live "left to assign" counter).
- **Split** equally, by exact amounts, by percentage (down to 0.01%), or by shares (e.g. 2 : 1 : 1). Everyone's share updates live as you type.
- **Currencies:** each expense uses that day's official reference rate, the trip's fixed rate (set by the owner), or a rate you type in. The rate is saved with the expense and **never changes by itself**.
- Whoever added an expense, or the trip owner, can edit or delete it. Two people editing at once can't overwrite each other, and every change is kept in the expense's history.
- Saving is safe on bad connections: tapping Save again can never create a duplicate.

## Balances
- Trip total, **your balance** ("you get back" / "you owe"), and everyone's position.
- **Who owes who** on the trip page at any time: a live list like "Bob owes Alice S$40.00", using the fewest transfers. It updates with every expense, before the trip is finished.
- Calculated in whole cents, never with floating-point decimals, so balances always add up to exactly zero.

## Settling up
- **Preview** at any time: who should pay whom, using the **fewest possible transfers** (proven minimum for up to 20 people with something owing; a clearly labelled efficient plan above that).
- The owner **finishes the trip**: expenses lock, and the plan is saved.
- The **payer** taps *I've sent it* after paying in their banking app (with a copy-amount button). The **recipient** taps *Got it ✓*, or *Not received* with a note.
- Progress shows as "3 of 5 transfers confirmed". The trip is **fully settled** only when every transfer is confirmed and every balance is zero.
- The owner can mark a transfer as **Settled another way** (cash, swapped debts…) with a note. It counts as paid.
- If a payment was marked *Not received* but turns up later, the recipient can still confirm it.
- Every transfer has a history of who did what, and when.
- The owner can **reopen** a finished trip to fix expenses. Received payments stay counted and listed as **Paid earlier**, and the rest is recalculated.
- A **trip summary** shows total spent, each person's position before and after, and transfers confirmed.

## Supporter
- **💛 Supporter**, for a month at a time or for life. Supporters get: the Supporter badge (now); trip export to PDF/CSV, trip recap charts, receipt photos and early access to new features (coming soon). Everything else stays free with no limits.
- **Become a Supporter:** one-off S$5 by PayNow (QR with your own reference), then message the developer on Telegram; the admin switches on Lifetime.
- **Invite a friend:** your own link; each friend who signs up with it gives you both 1 month as Supporter (stacks, up to 12 months ahead).

## Admin
- One admin account, the reserved ID `admin`, which can only be created with a private one-time code.
- **All trips** screen with filters and colour-coded tags: 🔵 Active · 🟢 On-going · 🟣 Needs finishing · 🟠 Pending settlement · ⚪ Ended · 🔴 Deleted.
- **Users** tab: every account (display name, @ID, joined, last active), searchable; expand one to see the trips they own or belong to, with tags.
- Set anyone's **Supporter** status: +1 month, lifetime, or remove; see who invited whom and their PayNow reference (searchable).
- **Disable accounts** (only when they're fully settled): read-only for them, a 🚫 Disabled folder, enable again any time. Trips with a disabled member can't be reopened.
- **Delete permanently** any trip (test trips), typing its name to confirm.
- Opens any trip **read-only**. In trips the admin has joined, they're a normal member.

## App (PWA)
- Developer credit (Made by Clement · LinkedIn) on Account and the login / sign-up screens.
- Install to the home screen on iPhone (Share → Add to Home Screen) or Android/desktop (Install button).
- Full-screen app with icon and launch screen.
- **Works offline (read-only):** trips, expenses, balances, who owes who and settle-up as last loaded, with a “Last updated” time. Trips are downloaded in the background. Changes need a connection and are greyed out offline. The offline copy is wiped on log out.
- "New version ready · Refresh" when an update is out. It waits while you're typing.
- "Waking up the server…" notice when the free server is starting up.

## Not included (by design)
Receipt photos/OCR, push notifications, comments, activity feeds, analytics, payments or bank integration. The app records transfers; you make them in your own banking app.
