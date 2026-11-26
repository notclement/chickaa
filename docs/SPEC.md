ChickAA (别鸡较)

Complete Product Requirements & Development Specification

Project type: Progressive Web App (PWA)
Product category: Group travel expense sharing and settlement
Primary tagline: Travel together. Don’t sweat the split.

⸻

1. Project Overview

Build a modern, lightweight, mobile-first Progressive Web App (PWA) called ChickAA, with the Chinese name 别鸡较 displayed in small print underneath the English name.

The application is inspired by Splitwise, but focuses specifically on managing shared expenses during group trips.

The core idea:

Friends travel together, record expenses as they go, and let the application calculate everyone’s final balances at the end of the trip.

Instead of making numerous individual payments throughout the trip, the application consolidates all outstanding debts and calculates the mathematically smallest number of bank transfers required to settle everyone.

The application does not need to initiate bank transfers. Participants will make transfers using their existing banking applications and record confirmations in ChickAA.

Product philosophy

别鸡较 — Don’t sweat the small stuff.

* Enjoy the trip instead of worrying about money.
* Make recording expenses effortless.
* Keep everyone’s balances transparent.
* Settle everything fairly at the end.
* Minimise the number of actual transfers.

The application should feel like a friendly travel companion, not an accounting or banking application.

⸻

2. Product Scope

The application must support the following core capabilities:

1. User registration and login without email or phone verification.
2. Create and manage trips.
3. Invite participants through shareable links and QR codes.
4. Allow participants to join trips.
5. Record expenses in multiple currencies.
6. Support different expense split methods.
7. Support expenses paid by multiple participants.
8. Allow the trip creator to select the trip’s base currency.
9. Calculate everyone’s net balance accurately.
10. Calculate the minimum possible number of transfers needed to settle the trip.
11. Allow participants to mark transfers as sent and confirm receipt.
12. Display the final settlement status.

Keep the product focused on these capabilities.

⸻

3. PWA REQUIREMENTS — CRITICAL

This project must be developed as a Progressive Web App from the beginning.

Do not build a native iOS or Android application.

Do not build a conventional website and treat PWA functionality as a future enhancement.

The application must be installable and usable through modern mobile browsers, particularly Safari on iOS and Chrome on Android.

3.1 PWA installation

Users should be able to access ChickAA through:

* A normal browser.
* An installed home-screen application.
* Desktop browsers.

Requirements:

* Installable on iOS through Safari’s Add to Home Screen functionality.
* Installable on Android through supported browser installation prompts.
* Installable on desktop browsers where supported.
* Use a proper web app manifest.
* Configure application name, short name, icons, theme colour, background colour and display mode.
* Use standalone display mode where supported.
* Provide an appropriate application icon and splash-screen configuration.
* Avoid browser-like navigation elements when launched as an installed application.

The installed application should feel as close as reasonably possible to a native mobile application.

3.2 PWA manifest

Implement a valid manifest.webmanifest.

Include:

* name: ChickAA (别鸡较)
* short_name: ChickAA
* start_url
* scope
* display: standalone
* theme_color
* background_color
* Application icons in appropriate sizes.
* Maskable icons where supported.
* Appropriate orientation settings.

3.3 Service worker

Implement a service worker to support:

* Application shell caching.
* Static asset caching.
* Offline application loading where possible.
* Controlled cache updates.
* Cache versioning.
* Old cache cleanup.
* Safe fallback behaviour when the network is unavailable.

Use a maintained PWA implementation compatible with the selected Next.js architecture.

Do not implement unnecessary custom service-worker complexity if an established library provides the required functionality.

3.4 Offline behaviour

The application should provide useful offline functionality because users may be travelling without reliable internet access.

At minimum:

Available offline:

* Open the application shell.
* View previously loaded trips.
* View previously loaded expense records.
* View previously loaded member lists.
* View previously calculated balances.
* View the latest downloaded settlement plan.

Expense recording offline:

Allow users to prepare and save expenses locally while offline.

Requirements:

* Store pending expenses in IndexedDB.
* Clearly identify unsynchronised expenses.
* Synchronise pending expenses when connectivity returns.
* Prevent duplicate expense submissions.
* Handle conflicting changes safely.
* Show synchronisation status.
* Preserve locally saved expenses if the application is closed before synchronisation.

Do not assume that service-worker caching alone provides offline data functionality.

Implement a proper client-side persistence and synchronisation strategy.

For financial operations, the server remains the authoritative source of truth.

If an offline expense cannot yet be validated or synchronised, clearly show it as pending rather than silently treating it as a confirmed server-side expense.

Do not allow users to confirm actual settlements offline without server validation.

3.5 Responsive design

The application must be designed mobile-first.

Prioritise:

* iPhone.
* Android phones.
* Tablet.
* Desktop.

Requirements:

* Responsive layouts.
* Touch-friendly buttons.
* Readable typography.
* Proper spacing.
* Mobile-friendly forms.
* Safe-area support for devices with notches and home indicators.
* No horizontal scrolling on normal mobile screens.
* Appropriate keyboard handling.
* Good performance on mobile networks.

3.6 PWA update handling

When a new version is deployed:

* Detect available updates.
* Notify users that an update is available.
* Allow the user to refresh or update the application.
* Avoid unexpectedly discarding locally stored pending expenses.
* Maintain backward-compatible synchronisation where practical.

3.7 PWA security

* Serve the application exclusively over HTTPS in production.
* Use secure session handling.
* Protect authentication tokens.
* Apply appropriate Content Security Policy headers.
* Avoid storing sensitive authentication credentials in localStorage.
* Validate all server-side financial operations.
* Ensure offline cached data is scoped to the authenticated user.
* Clear sensitive user-specific cached data on logout.

⸻

4. Branding & Visual Identity

Official application name

ChickAA

Chinese name

别鸡较

Tagline

Travel together. Don’t sweat the split.

Brand hierarchy

The English name must be the primary identity.

The Chinese name should appear in small print directly underneath.

Example:

ChickAA
别鸡较

Requirements:

* English name is prominent.
* Chinese characters are smaller and secondary.
* Keep the branding clean and understated.
* Do not display the Chinese name at the same size as the English name.

Brand personality

* Friendly.
* Playful.
* Approachable.
* Modern.
* Slightly cheeky.
* Travel-oriented.
* Friendship-first.

Avoid a corporate banking aesthetic.

UI direction

Use a clean, modern, minimal design.

The interface should:

* Feel comfortable on mobile.
* Make expenses easy to record.
* Present balances clearly.
* Avoid unnecessary information density.
* Use subtle animations only where useful.
* Use intuitive icons and labels.
* Have consistent typography and spacing.

Avoid excessive dashboards, charts and decorative elements.

⸻

5. User Accounts & Authentication

Users must be able to create accounts without email or phone verification.

Registration fields

* Username.
* Password.
* Display name.

Requirements

* Username must be unique.
* Password must be securely hashed using Argon2id or an equivalent.
* No email verification.
* No SMS verification.
* Users log in using username and password.
* Secure session management.
* Rate-limit login attempts.
* Support account recovery through a recovery code or another suitable method that does not require verified email or phone details.

Users should not need to provide personal contact details to use the application.

⸻

6. Trip Creation & Management

Any registered user can create a trip.

Trip creation fields

* Trip name.
* Trip description (optional).
* Start date (optional).
* End date (optional).
* Base currency.
* Trip creator.

The creator becomes the trip owner.

Base currency

The creator must select the trip’s base currency.

Examples:

* SGD
* MYR
* USD
* THB
* JPY
* EUR
* IDR
* CNY

The base currency is used for all consolidated balance calculations and final settlement recommendations.

A trip should have one base currency.

Trip lifecycle

Support:

* Active.
* Completed.
* Archived.

The creator can complete the trip when the group is ready to settle.

Completed trips retain their expense and settlement history.

⸻

7. Invitations & Joining Trips

The trip creator must be able to invite participants through a shareable invitation link.

Requirements

* Generate a cryptographically secure invitation token.
* Generate a shareable URL.
* Support copying the URL.
* Support sharing through WhatsApp, Telegram and other applications using the device’s native sharing capabilities where available.
* Generate a QR code for the invitation URL.
* Allow anyone with a valid link to join.
* Allow new users to register before joining.
* Allow existing users to log in and join.
* Prevent duplicate membership.
* Allow the creator to revoke or regenerate links.
* Support optional expiry dates and usage limits.

Invitation workflow

1. Creator generates an invitation.
2. Creator shares the link or QR code.
3. Participant opens the link.
4. Participant sees the trip name and invitation details.
5. Participant registers or logs in.
6. Participant joins the trip.
7. Participant is redirected to the trip dashboard.

The process should be simple and frictionless.

⸻

8. Trip Members

Each trip has a member list.

Member information:

* User ID.
* Display name.
* Role.
* Date joined.

Permissions:

Trip creator

* Manage trip settings.
* Invite participants.
* Manage trip lifecycle.
* Complete the trip.

All members

* View expenses.
* Add expenses.
* View balances.
* View the settlement plan.
* Mark their transfers as sent.
* Confirm receipt of transfers owed to them.

Historical financial records must remain intact if membership changes.

⸻

9. Expense Management

Any trip member can record an expense.

Expense fields

* Description.
* Total amount.
* Original currency.
* Date.
* Payer or payers.
* Participants sharing the expense.
* Split method.
* Optional notes.

Multiple currencies

A trip can contain expenses in different currencies.

Example:

Trip base currency: SGD

Expense	Amount	Currency
Hotel	12,000	THB
Dinner	1,500	MYR
Taxi	30	SGD
Attraction tickets	8,000	JPY

The system must convert each expense into the trip’s base currency for consolidated calculations.

Exchange rate handling

Support:

1. Automatic exchange rates from an exchange-rate API.
2. Manual exchange-rate entry.
3. Trip-specific exchange rates where appropriate.

Every expense must preserve:

* Original amount.
* Original currency.
* Base currency.
* Exchange rate applied.
* Converted base-currency amount.
* Date of conversion.

Historical exchange rates must not change automatically when market rates change.

The application must use integer minor units or exact decimal arithmetic for all financial calculations.

Never use ordinary binary floating-point arithmetic for money.

⸻

10. Expense Split Methods

Support the following split types.

A. Equal split

Divide the total expense equally between selected participants.

Handle rounding differences deterministically.

B. Unequal split

Allow custom amounts for each participant.

C. Percentage split

Allow participants to be assigned percentages.

All percentages must total 100%.

D. Shares split

Allow different share weights.

Example:

* Alice: 2 shares.
* Bob: 1 share.
* Charlie: 1 share.

E. Exact amount split

Allow the user to specify exactly how much each participant owes.

Multiple payers

Support multiple participants paying towards one expense.

Example:

* Total expense: SGD 300.
* Alice paid SGD 200.
* Bob paid SGD 100.
* Four participants share equally.

The system must correctly account for the amount paid by each person and the share allocated to each participant.

Expense editing

* Allow authorised members to edit expenses.
* Recalculate balances after changes.
* Preserve historical financial integrity.
* Use soft deletion or compensating ledger entries.
* Prevent invalid or inconsistent allocations.

⸻

11. Financial Ledger & Balance Calculation

The ledger is the source of truth for all financial calculations.

For each participant:

Net balance = Total paid − Total allocated expense share

Interpretation:

* Positive: Participant should receive money.
* Negative: Participant owes money.
* Zero: Participant is balanced.

Example:

Trip base currency: SGD

Participant	Paid	Expense share	Net
Alice	500	300	+200
Bob	100	200	-100
Charlie	0	150	-150
David	50	0	+50

The system must:

* Calculate balances across all trip expenses.
* Convert different currencies into the trip’s base currency.
* Account for multiple payers.
* Account for every split method.
* Handle rounding consistently.
* Recalculate balances when expenses change.
* Ensure total participant net balances reconcile to zero.

All authoritative calculations must be performed on the server.

⸻

12. Settlement Optimisation — Core Differentiating Feature

This is the most important financial feature of ChickAA.

At the end of the trip, calculate the mathematically minimum number of actual transfers needed to settle everyone’s outstanding balances.

The objective is to minimise the number of transfers, not merely simplify the display of individual debts.

Example

Final balances:

Participant	Net balance
Alice	+300
Bob	+200
Charlie	-250
David	-150
Eve	-100

One valid settlement plan:

From	To	Amount
Charlie	Alice	250
David	Alice	50
David	Bob	100
Eve	Bob	100

This settles everyone using four transfers.

Algorithm requirements

Implement an exact minimum-transfer optimisation algorithm for normal trip group sizes.

Potential approaches:

* Subset dynamic programming.
* Branch-and-bound.
* Exact minimum-cash-flow optimisation.

A basic greedy algorithm is not sufficient as the guaranteed optimal solution because it can produce more transfers than necessary.

Requirements:

* Identify creditors.
* Identify debtors.
* Consolidate all balances.
* Generate valid payment directions.
* Minimise transfer count.
* Ensure all amounts are in the base currency.
* Ensure every debtor pays exactly their outstanding debt.
* Ensure every creditor receives exactly their outstanding credit.
* Ensure all balances reach zero.
* Use deterministic tie-breaking.
* Document complexity and supported group sizes.
* Provide a safe performance fallback for unusually large groups.

The system must never claim a settlement plan is mathematically optimal unless the algorithm has actually established optimality.

Settlement plan display

Display:

* Sender.
* Recipient.
* Amount.
* Currency.
* Payment status.

Each user must be able to easily understand what they owe and what they should receive.

The application only recommends transfers. It does not initiate bank payments.

⸻

13. Settlement Confirmation

Participants make transfers outside the application using their usual banking applications.

The app records and tracks the transfer status.

Settlement statuses

* Pending.
* Sent.
* Confirmed.
* Disputed.
* Cancelled.

Workflow

1. Application generates settlement plan.
2. Debtor makes the bank transfer externally.
3. Debtor marks the transfer as sent.
4. Recipient confirms receipt.
5. Transfer becomes confirmed.
6. Overall trip settlement progress updates.

A payment marked as sent must not automatically count as confirmed.

Only the recipient can confirm receipt.

Preserve settlement history and confirmation events.

Display progress, for example:

* 3 of 5 transfers confirmed.
* 2 transfers pending.
* Trip fully settled once all required transfers are confirmed.

Do not allow a trip to be considered fully settled merely because recommended payments were generated.

⸻

14. Application Screens & User Experience

Keep navigation simple.

A. Login / Registration

* ChickAA logo.
* 别鸡较 in small print.
* Username and password.
* Registration.
* Login.
* Recovery-code workflow.

B. My Trips

Display:

* Active trips.
* Completed trips.
* Trips joined.
* Create trip.
* Join trip through invitation link.

C. Create Trip

Fields:

* Trip name.
* Base currency.
* Optional description.
* Optional dates.

D. Trip Dashboard

Display:

* Trip name.
* Base currency.
* Members.
* Total expenses.
* Individual balances.
* Recent expenses.
* Add expense.
* Invite members.
* Settlement overview.

E. Add Expense

A fast and straightforward expense-entry interface:

* Description.
* Amount.
* Currency.
* Payer or payers.
* Participants.
* Split method.
* Save.

Optimise this screen for mobile usage.

F. Expense List

Show:

* Description.
* Amount.
* Currency.
* Payer.
* Date.
* Participants.

G. Balances

Show every participant’s current net position in the base currency.

Clearly distinguish:

* Owes money.
* Is owed money.
* Balanced.

H. Settle Up

Display:

* Final net positions.
* Optimised settlement plan.
* Minimum transfer count.
* Payment statuses.
* Settlement progress.

I. Final Trip Summary

Display:

* Total expenses.
* Each participant’s final net position.
* Recommended transfers.
* Confirmed transfers.
* Final settlement status.

⸻

15. Offline Data & Synchronisation Architecture

Offline functionality is important for a travel-focused PWA.

Use:

* IndexedDB for structured client-side data.
* Service worker for application shell and static asset caching.
* A synchronisation queue for pending expense submissions.
* Server-side validation and reconciliation.

Synchronisation requirements

Each locally created expense should have a client-generated unique identifier.

When synchronising:

* Send the client-generated ID.
* Server checks for duplicates.
* Server validates the expense.
* Server commits the expense transactionally.
* Client updates the local record to synchronised.
* Conflicting changes must be detected and surfaced to the user.

Do not silently overwrite conflicting financial records.

The interface should distinguish:

* Saved locally.
* Waiting to sync.
* Synced successfully.
* Sync failed.
* Requires user attention.

Do not allow offline edits to overwrite newer server-side data without conflict resolution.

⸻

16. Technical Architecture

Build this as a maintainable, production-ready PWA.

Frontend

Recommended:

* Next.js.
* React.
* TypeScript.
* Tailwind CSS.

Requirements:

* Responsive mobile-first interface.
* PWA support integrated from the beginning.
* Web app manifest.
* Service worker.
* IndexedDB.
* Offline synchronisation.
* Accessible UI components.

Backend

Recommended:

* Node.js.
* NestJS or an equivalent structured backend.
* REST API or another clearly documented API architecture.

Requirements:

* Authentication.
* Trip management.
* Invitation management.
* Expense management.
* Currency conversion.
* Ledger calculations.
* Settlement optimisation.
* Payment confirmation.

Database

Recommended:

* PostgreSQL.
* Prisma or Drizzle ORM.

Use relational constraints, transactions and indexes.

External services

* Exchange-rate API.
* QR-code generation library.

Avoid unnecessary paid third-party services.

⸻

17. Suggested Database Structure

Design a relational database that supports financial integrity and historical records.

Suggested tables:

Users

* id
* username
* password_hash
* display_name
* recovery_code_hash
* created_at
* updated_at

Trips

* id
* name
* description
* base_currency
* start_date
* end_date
* created_by
* status
* created_at
* updated_at

TripMembers

* id
* trip_id
* user_id
* role
* joined_at

Invitations

* id
* trip_id
* token_hash
* created_by
* expires_at
* max_uses
* usage_count
* revoked_at
* created_at

Expenses

* id
* trip_id
* description
* original_amount
* original_currency
* exchange_rate
* base_currency_amount
* expense_date
* created_by
* status
* client_id
* created_at
* updated_at

ExpensePayers

* id
* expense_id
* user_id
* amount_paid_original
* currency
* amount_paid_base

ExpenseSplits

* id
* expense_id
* user_id
* split_type
* original_share_amount
* base_share_amount
* percentage
* shares

Settlements

* id
* trip_id
* from_user_id
* to_user_id
* amount
* currency
* status
* settlement_version
* created_at
* updated_at

SettlementEvents

* id
* settlement_id
* actor_user_id
* event_type
* created_at

ExpenseSyncRecords (if required)

* id
* user_id
* client_id
* server_expense_id
* sync_status
* created_at
* updated_at

Refine the schema as needed.

Important:

* Add appropriate foreign keys.
* Add uniqueness constraints.
* Use indexes for common queries.
* Ensure financial changes are transactional.
* Preserve historical settlement versions.
* Prevent duplicate offline synchronisation.

⸻

18. Security & Financial Integrity

Implement:

* Secure password hashing.
* Secure session management.
* HTTPS.
* CSRF protection where applicable.
* Input validation.
* Rate limiting.
* Access control.
* Invitation token hashing.
* Database transactions.
* Server-side financial validation.
* Auditability of financial changes.
* Protection against duplicate requests.
* Safe offline synchronisation.

Financial rules:

1. Use integer minor units or exact decimal arithmetic.
2. Never rely on floating-point arithmetic for money.
3. Ensure all split allocations reconcile to expense totals.
4. Ensure all payer contributions reconcile to the expense total.
5. Ensure total net balances equal zero.
6. Ensure settlement transfers reconcile with final balances.
7. Never silently alter historical exchange rates.
8. Preserve historical expense and settlement records.

⸻

19. Explicitly Out of Scope

Do not implement these features:

* Receipt uploads or OCR.
* Activity feeds.
* Comments.
* Push notifications.
* Advanced search and filtering.
* Analytics dashboards.
* Spending reports.
* Subscription plans.
* Monetisation.
* Payment gateway integrations.
* Direct bank transfers.
* Social networking features.
* Loyalty programmes.
* AI expense categorisation.

Do not expand the project beyond the agreed scope without asking.

⸻

20. Testing Requirements

Create automated unit, integration and end-to-end tests.

Authentication

* Registration.
* Login.
* Duplicate username prevention.
* Password security.
* Account recovery.

Trips

* Create trip.
* Join trip.
* Invitation link.
* QR invitation.
* Revoke invitation.
* Duplicate membership prevention.

Expenses

* Equal splits.
* Unequal splits.
* Percentage splits.
* Shares splits.
* Exact amount splits.
* Multiple payers.
* Multi-currency expenses.
* Manual exchange rates.
* Rounding.
* Expense modifications.

Financial calculations

* Net balance calculation.
* Currency conversion.
* Ledger reconciliation.
* Historical exchange rates.
* Settlement balance reconciliation.

Settlement optimisation

* Minimum transfer count.
* Correct payment directions.
* Correct transfer amounts.
* Every debtor fully settled.
* Every creditor fully paid.
* Greedy counterexamples.
* Exact optimality tests.
* Larger group performance.

Settlement confirmation

* Sender marks payment as sent.
* Recipient confirms receipt.
* Disputed payment.
* Cancelled payment.
* Settlement progress.

PWA

* Manifest validity.
* Installability.
* Service-worker registration.
* Offline application loading.
* IndexedDB persistence.
* Offline expense creation.
* Synchronisation after reconnection.
* Duplicate submission prevention.
* Conflict handling.
* Cache updates.
* Logout and cached-data isolation.

Test on:

* iOS Safari.
* Installed iOS PWA.
* Android Chrome.
* Installed Android PWA.
* Desktop Chrome or equivalent.

⸻

21. Development Phases

Implement the project in phases.

Phase 1 — Project Foundation

* Set up Next.js and TypeScript.
* Set up Tailwind CSS.
* Set up PostgreSQL.
* Configure ORM and migrations.
* Establish project architecture.
* Implement branding and responsive design.
* Configure PWA manifest and service worker.

Phase 2 — Authentication & Trips

* Registration.
* Login.
* Session handling.
* Recovery codes.
* Trip creation.
* Trip membership.
* Invitation links.
* QR-code generation.

Phase 3 — Expense Management

* Expense creation.
* All split methods.
* Multiple payers.
* Multi-currency support.
* Exchange-rate handling.
* Expense editing.

Phase 4 — Financial Engine

* Ledger implementation.
* Balance calculation.
* Currency conversion.
* Rounding and reconciliation.
* Financial unit tests.

Phase 5 — Settlement Optimisation

* Exact minimum-transfer algorithm.
* Settlement recommendation UI.
* Optimality testing.
* Performance handling.

Phase 6 — Settlement Tracking

* Mark as sent.
* Confirm receipt.
* Dispute and cancellation.
* Settlement progress.
* Final trip summary.

Phase 7 — Offline PWA

* IndexedDB storage.
* Offline expense creation.
* Synchronisation queue.
* Conflict resolution.
* Cache management.
* PWA installation testing.

The PWA foundation must be established in Phase 1. Offline data synchronisation can be completed in Phase 7.

Phase 8 — Final Polish & Deployment

* Mobile UI refinement.
* Cross-browser testing.
* Security review.
* Financial integrity review.
* End-to-end testing.
* Production deployment.
* Documentation.

⸻

22. Deployment Requirements

Deploy as a production PWA accessible through a public HTTPS URL.

The deployment must support:

* Frontend hosting.
* Backend hosting.
* PostgreSQL database.
* Secure environment variables.
* Database migrations.
* HTTPS.
* Service-worker delivery.
* PWA installation.
* Persistent data storage.
* Application updates.

Provide a straightforward deployment process.

Do not make the application dependent on running a local development server.

⸻

23. Expected Deliverables

Deliver a working application, not just a visual prototype.

Provide:

1. Complete source code.
2. Frontend implementation.
3. Backend implementation.
4. Database schema.
5. Database migrations.
6. Authentication system.
7. PWA manifest.
8. Service worker.
9. IndexedDB offline storage.
10. Offline synchronisation implementation.
11. Multi-currency expense engine.
12. Financial ledger.
13. Exact settlement optimisation algorithm.
14. Settlement confirmation workflow.
15. Automated tests.
16. Environment variable example.
17. README.
18. Local setup instructions.
19. Production deployment instructions.

⸻

24. Final End-to-End Acceptance Scenario

The application must support the following complete workflow:

1. Alice opens ChickAA on her iPhone.
2. Alice registers without an email address or phone number.
3. Alice installs ChickAA on her home screen.
4. Alice creates a trip called “Bali 2027”.
5. Alice selects SGD as the trip’s base currency.
6. Alice generates an invitation link and QR code.
7. Bob, Charlie and David join the trip.
8. All four participants record expenses throughout the trip.
9. Some expenses are in SGD, others in IDR and other currencies.
10. Participants use different split methods.
11. Some expenses have multiple payers.
12. The application accurately calculates everyone’s balances in SGD.
13. A participant can record an expense while offline.
14. The expense is stored locally and synchronised when connectivity returns.
15. Alice completes the trip.
16. ChickAA calculates the mathematically minimum number of bank transfers needed.
17. Every participant sees exactly who they need to pay and how much.
18. Participants make transfers using their normal banking applications.
19. Senders mark transfers as sent.
20. Recipients confirm receipt.
21. The settlement progress updates.
22. Once every transfer is confirmed, everyone’s net position is zero.
23. The trip is marked as fully settled.
24. All expense and settlement history remains accessible.

⸻

25. Instructions to Claude

Act as a senior full-stack engineer and software architect.

Your task is to design and build ChickAA according to this specification.

Follow these instructions:

1. Treat this document as the source of truth for product scope.
2. Build a Progressive Web App, not a native mobile application.
3. Establish the PWA architecture from the beginning.
4. Prioritise mobile-first usability.
5. Prioritise financial correctness over visual complexity.
6. Implement the settlement optimiser as an exact minimum-transfer solution for supported group sizes.
7. Make offline expense creation reliable and prevent duplicate synchronisation.
8. Use maintainable, well-supported technologies.
9. Do not introduce features that are explicitly out of scope.
10. Do not leave core functionality as mock data or placeholders.
11. Write tests for the financial engine before relying on it in the UI.
12. Document architectural decisions and important limitations.

Before coding

First produce:

* Recommended architecture.
* Project folder structure.
* Database schema.
* API endpoint specification.
* PWA implementation approach.
* Offline synchronisation design.
* Financial ledger design.
* Exact settlement optimisation algorithm and its complexity.
* Development milestones.

Identify any contradictions or technically risky requirements before implementation.

Once the architecture is established, proceed with implementation phase by phase.

Do not stop at a plan or prototype. The final objective is a fully working, deployable PWA.

The defining requirement of ChickAA is simple: record trip expenses in any supported currency, calculate everyone’s accurate net balance, and settle the entire trip using the fewest possible bank transfers.

Everything else should support this objective without making the application unnecessarily complicated.