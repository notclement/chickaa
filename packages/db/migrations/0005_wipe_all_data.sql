-- v1.1.0: one-time fresh start requested by the owner (Clem). Deletes every account, trip,
-- expense and settlement. Runs exactly once (drizzle records applied migrations).
-- The exchange-rate cache is public data and is kept.
TRUNCATE TABLE
  settlement_events, settlements, settlement_plans,
  expense_revisions, expense_splits, expense_payers, expenses,
  trip_fx_rates, invitations, trip_members, trips,
  sessions, rate_limits, users
RESTART IDENTITY CASCADE;
