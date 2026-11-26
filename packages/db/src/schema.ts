/**
 * NoChickenCall database schema. See docs/ARCHITECTURE.md §5.
 *
 * Money rules:
 *  - every amount is BIGINT minor units (mode: 'bigint' → JS bigint, never float)
 *  - every exchange rate is NUMERIC(24,12) (mode: string → exact decimal)
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

const money = (name: string) => bigint(name, { mode: 'bigint' });
const rate = (name: string) => numeric(name, { precision: 24, scale: 12 });
const currency = (name: string) => char(name, { length: 3 });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow();

// ---------- enums ----------
export const tripStatus = pgEnum('trip_status', ['active', 'completed', 'archived']);
export const memberRole = pgEnum('member_role', ['owner', 'member']);
export const rateSource = pgEnum('rate_source', ['same_currency', 'api', 'trip_fixed', 'manual']);
export const splitType = pgEnum('split_type', ['equal', 'exact', 'percentage', 'shares']);
export const revisionAction = pgEnum('revision_action', ['create', 'update', 'delete']);
export const settlementAlgorithm = pgEnum('settlement_algorithm', ['exact_dp', 'heuristic']);
export const settlementStatus = pgEnum('settlement_status', [
  'pending',
  'sent',
  'confirmed',
  'disputed',
  'cancelled',
]);

// ---------- auth ----------
export const users = pgTable('users', {
  id: id(),
  username: citext('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  recoveryCodeHash: text('recovery_code_hash').notNull(),
  /** Only the reserved ID "admin" (created with the one-time ADMIN_SETUP_CODE) has this. */
  isAdmin: boolean('is_admin').notNull().default(false),
  /** Supporter until this time (referral months, or given by the admin). */
  supporterUntil: ts('supporter_until'),
  /** Supporter forever (paid supporters, set by the admin). */
  supporterLifetime: boolean('supporter_lifetime').notNull().default(false),
  /** Code in this user's "Invite a friend" link. */
  referralCode: text('referral_code').unique(),
  /** Who invited this user (set at sign-up from an invite-a-friend link). */
  referredBy: uuid('referred_by'),
  /** Profile photo: tiny (≤ 24 KB) square WebP/JPEG, compressed in the browser before upload. */
  avatar: bytea('avatar'),
  avatarType: text('avatar_type'),
  /** Bumped on every change; part of the image URL so it can be cached forever. */
  avatarVersion: integer('avatar_version'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: createdAt(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: ts('window_start').notNull(),
  count: integer('count').notNull().default(0),
});

// ---------- trips ----------
export const trips = pgTable('trips', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  baseCurrency: currency('base_currency').notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  status: tripStatus('status').notNull().default('active'),
  completedAt: ts('completed_at'),
  /** Soft delete by the owner once everyone is settled: hidden from the app, records kept. */
  deletedAt: ts('deleted_at'),
  deletedBy: uuid('deleted_by').references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tripMembers = pgTable(
  'trip_members',
  {
    id: id(),
    tripId: uuid('trip_id').notNull().references(() => trips.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    role: memberRole('role').notNull().default('member'),
    joinedAt: ts('joined_at').notNull().defaultNow(),
    leftAt: ts('left_at'),
  },
  (t) => [unique('trip_members_trip_user_uq').on(t.tripId, t.userId), index('trip_members_user_idx').on(t.userId)],
);

export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    tripId: uuid('trip_id').notNull().references(() => trips.id),
    tokenHash: text('token_hash').notNull().unique(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    expiresAt: ts('expires_at'),
    maxUses: integer('max_uses'),
    usageCount: integer('usage_count').notNull().default(0),
    revokedAt: ts('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('invitations_trip_idx').on(t.tripId),
    check('invitations_max_uses_positive', sql`${t.maxUses} IS NULL OR ${t.maxUses} > 0`),
  ],
);

// ---------- exchange rates ----------
export const tripFxRates = pgTable(
  'trip_fx_rates',
  {
    tripId: uuid('trip_id').notNull().references(() => trips.id),
    currency: currency('currency').notNull(),
    rate: rate('rate').notNull(),
    setBy: uuid('set_by').notNull().references(() => users.id),
    setAt: ts('set_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.currency] }), check('trip_fx_rate_positive', sql`${t.rate} > 0`)],
);

export const fxRateCache = pgTable(
  'fx_rate_cache',
  {
    base: currency('base').notNull(),
    quote: currency('quote').notNull(),
    rateDate: date('rate_date').notNull(),
    rate: rate('rate').notNull(),
    /** Date the provider actually published the rate (weekends fall back to the last business day). */
    publishedDate: date('published_date'),
    provider: text('provider'),
    fetchedAt: ts('fetched_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.base, t.quote, t.rateDate] })],
);

// ---------- expenses ----------
export const expenses = pgTable(
  'expenses',
  {
    id: id(),
    tripId: uuid('trip_id').notNull().references(() => trips.id),
    clientId: uuid('client_id').notNull(),
    description: text('description').notNull(),
    /** One of EXPENSE_CATEGORIES in @ncc/core (validated by the API). */
    category: text('category').notNull().default('other'),
    notes: text('notes'),
    originalAmount: money('original_amount').notNull(),
    originalCurrency: currency('original_currency').notNull(),
    baseCurrency: currency('base_currency').notNull(),
    exchangeRate: rate('exchange_rate').notNull(),
    rateSource: rateSource('rate_source').notNull(),
    rateDate: date('rate_date').notNull(),
    baseAmount: money('base_amount').notNull(),
    splitType: splitType('split_type').notNull(),
    expenseDate: date('expense_date').notNull(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    version: integer('version').notNull().default(1),
    payloadHash: text('payload_hash').notNull(),
    deletedAt: ts('deleted_at'),
    deletedBy: uuid('deleted_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('expenses_trip_client_uq').on(t.tripId, t.clientId),
    index('expenses_trip_idx').on(t.tripId, t.deletedAt, t.expenseDate),
    check('expenses_original_positive', sql`${t.originalAmount} > 0`),
    check('expenses_base_positive', sql`${t.baseAmount} > 0`),
    check('expenses_rate_positive', sql`${t.exchangeRate} > 0`),
  ],
);

export const expensePayers = pgTable(
  'expense_payers',
  {
    expenseId: uuid('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    amountOriginal: money('amount_original').notNull(),
    amountBase: money('amount_base').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.userId] }),
    check('expense_payers_positive', sql`${t.amountOriginal} > 0 AND ${t.amountBase} >= 0`),
  ],
);

export const expenseSplits = pgTable(
  'expense_splits',
  {
    expenseId: uuid('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    shareOriginal: money('share_original').notNull(),
    shareBase: money('share_base').notNull(),
    inputPercentageBp: integer('input_percentage_bp'),
    inputShares: integer('input_shares'),
    inputAmount: money('input_amount'),
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.userId] }),
    check('expense_splits_non_negative', sql`${t.shareOriginal} >= 0 AND ${t.shareBase} >= 0`),
  ],
);

export const expenseRevisions = pgTable(
  'expense_revisions',
  {
    id: id(),
    expenseId: uuid('expense_id').notNull().references(() => expenses.id),
    version: integer('version').notNull(),
    action: revisionAction('action').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    actorUserId: uuid('actor_user_id').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [unique('expense_revisions_expense_version_uq').on(t.expenseId, t.version)],
);

// ---------- settlement ----------
export const settlementPlans = pgTable(
  'settlement_plans',
  {
    id: id(),
    tripId: uuid('trip_id').notNull().references(() => trips.id),
    version: integer('version').notNull(),
    algorithm: settlementAlgorithm('algorithm').notNull(),
    isProvenOptimal: boolean('is_proven_optimal').notNull(),
    transferCount: integer('transfer_count').notNull(),
    balancesSnapshot: jsonb('balances_snapshot').notNull(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
    supersededAt: ts('superseded_at'),
  },
  (t) => [unique('settlement_plans_trip_version_uq').on(t.tripId, t.version)],
);

export const settlements = pgTable(
  'settlements',
  {
    id: id(),
    planId: uuid('plan_id').notNull().references(() => settlementPlans.id),
    tripId: uuid('trip_id').notNull().references(() => trips.id),
    fromUserId: uuid('from_user_id').notNull().references(() => users.id),
    toUserId: uuid('to_user_id').notNull().references(() => users.id),
    amount: money('amount').notNull(),
    currency: currency('currency').notNull(),
    status: settlementStatus('status').notNull().default('pending'),
    /** Owner marked it "settled another way" (cash, offset…): counts as confirmed. */
    settledOutside: boolean('settled_outside').notNull().default(false),
    /** Order within the plan, so transfers always list the same way. */
    position: integer('position').notNull().default(0),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('settlements_trip_status_idx').on(t.tripId, t.status),
    check('settlements_amount_positive', sql`${t.amount} > 0`),
    check('settlements_not_self', sql`${t.fromUserId} <> ${t.toUserId}`),
  ],
);

export const settlementEvents = pgTable(
  'settlement_events',
  {
    id: id(),
    settlementId: uuid('settlement_id').notNull().references(() => settlements.id),
    actorUserId: uuid('actor_user_id').notNull().references(() => users.id),
    fromStatus: settlementStatus('from_status'),
    toStatus: settlementStatus('to_status').notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('settlement_events_settlement_idx').on(t.settlementId)],
);
