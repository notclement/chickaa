# Features

What NoChickenCall does as of **v0.6.1** (the MVP). See [PHASES.md](PHASES.md) for what's next.

## Accounts
- Sign up with a **name, username and password**. No email or phone number.
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
- Any member can add an expense: amount, currency, description, date, notes.
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
- Every transfer has a history of who did what, and when.
- The owner can **reopen** a finished trip to fix expenses. Received payments stay counted, and the rest is recalculated.
- A **trip summary** shows total spent, each person's position before and after, and transfers confirmed.

## App (PWA)
- Install to the home screen on iPhone (Share → Add to Home Screen) or Android/desktop (Install button).
- Full-screen app with icon and launch screen.
- Opens with no signal. Changes need a connection.
- "New version ready · Refresh" when an update is out. It waits while you're typing.
- "Waking up the server…" notice when the free server is starting up.

## Not included (by design)
Receipt photos/OCR, push notifications, comments, activity feeds, analytics, payments or bank integration. The app records transfers; you make them in your own banking app.
