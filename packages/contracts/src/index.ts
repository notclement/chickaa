import { z } from 'zod';
import { ADMIN_USERNAME, CURRENCY_CODES, isReservedUsername } from '@ncc/core';

export { ADMIN_USERNAME };

/** Shared request/response schemas (client + server). Grows phase by phase. */

export const API_VERSION = 'v1' as const;

// ---------- common ----------
export const HealthResponse = z.object({
  status: z.literal('ok'),
  version: z.string(),
  db: z.enum(['ok', 'unavailable']),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

export const ErrorCode = {
  VALIDATION: 'VALIDATION',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  INVITE_INVALID: 'INVITE_INVALID',
  TRIP_LOCKED: 'TRIP_LOCKED',
  CSRF: 'CSRF',
  INTERNAL: 'INTERNAL',
} as const;

// ---------- auth ----------
export const Username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'At least 3 characters')
  .max(24, 'At most 24 characters')
  .regex(/^[a-z0-9_.]+$/, 'Letters, numbers, _ and . only')
  .refine((u) => u === ADMIN_USERNAME || !isReservedUsername(u), 'That ID is reserved. Please pick another');

export const Password = z
  .string()
  .min(8, 'At least 8 characters')
  .max(200, 'Too long');

export const DisplayName = z.string().trim().min(1, 'Required').max(40, 'At most 40 characters');

export const RecoveryCode = z
  .string()
  .trim()
  .toUpperCase()
  .transform((s) => s.replace(/[^A-Z0-9]/g, ''))
  .pipe(z.string().length(16, 'Recovery codes are 16 letters/numbers'));

export const RegisterRequest = z.object({
  username: Username,
  password: Password,
  displayName: DisplayName,
  /** Only for the reserved "admin" ID: must match ADMIN_SETUP_CODE on the server. */
  adminSetupCode: z.string().max(200).optional(),
});
export type RegisterRequest = z.input<typeof RegisterRequest>;

export const LoginRequest = z.object({ username: z.string().trim().toLowerCase().min(1), password: z.string().min(1) });
export type LoginRequest = z.input<typeof LoginRequest>;

export const RecoverRequest = z.object({ username: z.string().trim().toLowerCase().min(1), recoveryCode: RecoveryCode, newPassword: Password });
export type RecoverRequest = z.input<typeof RecoverRequest>;

export const ChangePasswordRequest = z.object({ currentPassword: z.string().min(1), newPassword: Password });
export type ChangePasswordRequest = z.input<typeof ChangePasswordRequest>;

export const RegenerateRecoveryRequest = z.object({ password: z.string().min(1) });

export const UpdateProfileRequest = z.object({ displayName: DisplayName });

export const User = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  /** null = no photo. Otherwise part of the photo URL: /api/v1/users/:id/avatar?v=N */
  avatarVersion: z.number().nullable(),
  isAdmin: z.boolean(),
});
export type User = z.infer<typeof User>;

export const MeResponse = z.object({ user: User });
export type MeResponse = z.infer<typeof MeResponse>;

/** GET /auth/session: who's signed in on this device (null = nobody). Never a 401. */
export const SessionResponse = z.object({ user: User.nullable() });
export type SessionResponse = z.infer<typeof SessionResponse>;

/** Returned once on register/recover/regenerate: the raw recovery code is never shown again. */
export const AuthWithRecoveryResponse = z.object({ user: User, recoveryCode: z.string() });
export type AuthWithRecoveryResponse = z.infer<typeof AuthWithRecoveryResponse>;

// ---------- trips ----------
export const CurrencyCode = z.enum(CURRENCY_CODES as [string, ...string[]]);
/** A real calendar date: "2026-02-30" and "2026-13-01" are rejected (test report B2). */
export function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const IsoDate = z.string().refine(isRealDate, 'Use a real date (YYYY-MM-DD)');

export const CreateTripRequest = z
  .object({
    name: z.string().trim().min(1, 'Give the trip a name').max(60),
    description: z.string().trim().max(500).optional().nullable(),
    baseCurrency: CurrencyCode,
    startDate: IsoDate.optional().nullable(),
    endDate: IsoDate.optional().nullable(),
  })
  .refine((t) => !t.startDate || !t.endDate || t.startDate <= t.endDate, {
    message: 'End date is before start date',
    path: ['endDate'],
  });
export type CreateTripRequest = z.input<typeof CreateTripRequest>;

export const UpdateTripRequest = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    baseCurrency: CurrencyCode.optional(),
    startDate: IsoDate.optional().nullable(),
    endDate: IsoDate.optional().nullable(),
  })
  .refine((t) => !t.startDate || !t.endDate || t.startDate <= t.endDate, {
    message: 'End date is before start date',
    path: ['endDate'],
  });
export type UpdateTripRequest = z.input<typeof UpdateTripRequest>;

export const TripStatus = z.enum(['active', 'completed', 'archived']);
/** viewer = the admin looking at a trip they're not in (read-only). */
export const MemberRole = z.enum(['owner', 'member', 'viewer']);

export const Member = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarVersion: z.number().nullable(),
  role: MemberRole,
  joinedAt: z.string(),
});
export type Member = z.infer<typeof Member>;

export const TripSummary = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  baseCurrency: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  status: TripStatus,
  myRole: MemberRole,
  memberCount: z.number(),
  createdAt: z.string(),
});
export type TripSummary = z.infer<typeof TripSummary>;

export const TripDetail = TripSummary.extend({ members: z.array(Member), createdBy: z.string() });
export type TripDetail = z.infer<typeof TripDetail>;

export const TripListResponse = z.object({ trips: z.array(TripSummary) });
export type TripListResponse = z.infer<typeof TripListResponse>;

// ---------- invitations ----------
export const CreateInvitationRequest = z.object({
  /** Hours until the link stops working; null = never. */
  expiresInHours: z.number().int().positive().max(24 * 365).nullable().optional(),
  maxUses: z.number().int().positive().max(1000).nullable().optional(),
});
export type CreateInvitationRequest = z.input<typeof CreateInvitationRequest>;

export const Invitation = z.object({
  id: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  maxUses: z.number().nullable(),
  usageCount: z.number(),
  revokedAt: z.string().nullable(),
  active: z.boolean(),
});
export type Invitation = z.infer<typeof Invitation>;

/** The raw link is only returned at creation time (the server stores a hash). */
export const CreatedInvitation = z.object({ invitation: Invitation, url: z.string(), token: z.string() });
export type CreatedInvitation = z.infer<typeof CreatedInvitation>;

export const InvitationListResponse = z.object({ invitations: z.array(Invitation) });
export type InvitationListResponse = z.infer<typeof InvitationListResponse>;

export const InvitePreview = z.object({
  valid: z.boolean(),
  reason: z.enum(['ok', 'expired', 'revoked', 'used_up', 'not_found', 'trip_closed']),
  trip: z
    .object({ id: z.string(), name: z.string(), baseCurrency: z.string(), memberCount: z.number(), ownerName: z.string() })
    .nullable(),
  alreadyMember: z.boolean(),
});
export type InvitePreview = z.infer<typeof InvitePreview>;

export const JoinResponse = z.object({ tripId: z.string(), alreadyMember: z.boolean() });
export type JoinResponse = z.infer<typeof JoinResponse>;

// ---------- exchange rates ----------
/** Exact decimal as a string (never a JSON float). */
export const DecimalString = z.string().trim().min(1, 'Required').max(24);

export const FxRateResponse = z.object({
  from: z.string(),
  to: z.string(),
  /** 1 `from` = rate `to`, exact decimal string. */
  rate: z.string(),
  /** Date the provider published this rate (may be earlier than requested, e.g. weekends). */
  date: z.string(),
  source: z.enum(['same_currency', 'api', 'trip_fixed']),
  provider: z.string().nullable(),
});
export type FxRateResponse = z.infer<typeof FxRateResponse>;

export const TripFxRate = z.object({ currency: z.string(), rate: z.string(), setAt: z.string(), setBy: z.string() });
export type TripFxRate = z.infer<typeof TripFxRate>;
export const TripFxRatesResponse = z.object({ rates: z.array(TripFxRate) });
export type TripFxRatesResponse = z.infer<typeof TripFxRatesResponse>;
export const SetTripFxRateRequest = z.object({ rate: DecimalString });

// ---------- expenses ----------
const Uuid = z.uuid();

export const SplitRequest = z.discriminatedUnion('type', [
  z.object({ type: z.literal('equal'), participants: z.array(Uuid).min(1, 'Choose who shares it').max(100) }),
  z.object({ type: z.literal('exact'), amounts: z.array(z.object({ userId: Uuid, amount: DecimalString })).min(1).max(100) }),
  z.object({ type: z.literal('percentage'), percents: z.array(z.object({ userId: Uuid, percent: DecimalString })).min(1).max(100) }),
  z.object({ type: z.literal('shares'), shares: z.array(z.object({ userId: Uuid, shares: z.number().int().min(1).max(1000) })).min(1).max(100) }),
]);
export type SplitRequest = z.infer<typeof SplitRequest>;

/** How to get the exchange rate. Omit for expenses in the trip's own currency. */
export const RateChoice = z.discriminatedUnion('source', [
  z.object({ source: z.literal('api') }),
  z.object({ source: z.literal('trip_fixed') }),
  z.object({ source: z.literal('manual'), value: DecimalString }),
]);
export type RateChoice = z.infer<typeof RateChoice>;

const ExpenseFields = {
  description: z.string().trim().min(1, 'What was it for?').max(80),
  notes: z.string().trim().max(500).nullable().optional(),
  expenseDate: IsoDate,
  currency: CurrencyCode,
  amount: DecimalString,
  rate: RateChoice.optional(),
  payers: z.array(z.object({ userId: Uuid, amount: DecimalString })).min(1, 'Choose who paid').max(50),
  split: SplitRequest,
};

export const CreateExpenseRequest = z.object({ clientId: Uuid, ...ExpenseFields });
export type CreateExpenseRequest = z.input<typeof CreateExpenseRequest>;

export const UpdateExpenseRequest = z.object({ version: z.number().int().positive(), ...ExpenseFields });
export type UpdateExpenseRequest = z.input<typeof UpdateExpenseRequest>;

/** Minor-unit amounts travel as strings (bigint-safe). */
export const Expense = z.object({
  id: z.string(),
  tripId: z.string(),
  clientId: z.string(),
  description: z.string(),
  notes: z.string().nullable(),
  expenseDate: z.string(),
  currency: z.string(),
  amount: z.string(),
  baseCurrency: z.string(),
  baseAmount: z.string(),
  rate: z.string(),
  rateSource: z.enum(['same_currency', 'api', 'trip_fixed', 'manual']),
  rateDate: z.string(),
  splitType: z.enum(['equal', 'exact', 'percentage', 'shares']),
  payers: z.array(z.object({ userId: z.string(), amount: z.string(), baseAmount: z.string() })),
  splits: z.array(
    z.object({
      userId: z.string(),
      amount: z.string(),
      baseAmount: z.string(),
      percentBp: z.number().nullable(),
      shares: z.number().nullable(),
    }),
  ),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number(),
  deleted: z.boolean(),
});
export type Expense = z.infer<typeof Expense>;

export const ExpenseListResponse = z.object({ expenses: z.array(Expense) });
export type ExpenseListResponse = z.infer<typeof ExpenseListResponse>;

export const ExpenseRevision = z.object({
  version: z.number(),
  action: z.enum(['create', 'update', 'delete']),
  actor: z.object({ userId: z.string(), displayName: z.string() }),
  createdAt: z.string(),
  snapshot: z.unknown(),
});
export type ExpenseRevision = z.infer<typeof ExpenseRevision>;
export const ExpenseRevisionsResponse = z.object({ revisions: z.array(ExpenseRevision) });
export type ExpenseRevisionsResponse = z.infer<typeof ExpenseRevisionsResponse>;

// ---------- balances ----------
export const BalanceRow = z.object({
  userId: z.string(),
  paid: z.string(),
  share: z.string(),
  transfersOut: z.string(),
  transfersIn: z.string(),
  net: z.string(),
});
export type BalanceRow = z.infer<typeof BalanceRow>;

export const BalancesResponse = z.object({
  baseCurrency: z.string(),
  totalSpent: z.string(),
  expenseCount: z.number(),
  balances: z.array(BalanceRow),
});
export type BalancesResponse = z.infer<typeof BalancesResponse>;

// ---------- trip deletion ----------
/** Owner deletes a trip once everyone is settled. Typing the trip name confirms it. */
export const DeleteTripRequest = z.object({ confirmName: z.string() });
export type DeleteTripRequest = z.input<typeof DeleteTripRequest>;

// ---------- profile photos ----------
export const AVATAR_MAX_BYTES = 24 * 1024;
export const AVATAR_TYPES = ['image/webp', 'image/jpeg'] as const;

// ---------- settlement ----------
export const SettlementStatus = z.enum(['pending', 'sent', 'confirmed', 'disputed', 'cancelled']);
export type SettlementStatus = z.infer<typeof SettlementStatus>;

export const SettlementTransfer = z.object({
  /** null in a preview (nothing stored yet). */
  id: z.string().nullable(),
  fromUserId: z.string(),
  toUserId: z.string(),
  /** Minor units of `currency` (the trip's base currency). */
  amount: z.string(),
  currency: z.string(),
  status: SettlementStatus,
  /** Owner marked it "settled another way" (cash, offset…). Counts as confirmed. */
  settledOutside: z.boolean(),
  updatedAt: z.string().nullable(),
});
export type SettlementTransfer = z.infer<typeof SettlementTransfer>;

export const SettlementResponse = z.object({
  /** preview = trip still active, computed live; plan = trip completed, stored transfers. */
  state: z.enum(['preview', 'plan']),
  planVersion: z.number().nullable(),
  algorithm: z.enum(['exact_dp', 'heuristic']),
  /** Only true when the transfer count is the proven minimum. */
  provenOptimal: z.boolean(),
  nonZeroCount: z.number(),
  baseCurrency: z.string(),
  transfers: z.array(SettlementTransfer),
  /** Confirmed payments from before the trip was reopened (still count in balances). */
  earlier: z.array(SettlementTransfer),
  progress: z.object({ confirmed: z.number(), total: z.number(), fullySettled: z.boolean() }),
});
export type SettlementResponse = z.infer<typeof SettlementResponse>;

export const DisputeRequest = z.object({ note: z.string().trim().max(300).optional().nullable() });

export const SettlementEvent = z.object({
  fromStatus: SettlementStatus.nullable(),
  toStatus: SettlementStatus,
  actor: z.object({ userId: z.string(), displayName: z.string() }),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type SettlementEvent = z.infer<typeof SettlementEvent>;
export const SettlementEventsResponse = z.object({ events: z.array(SettlementEvent) });
export type SettlementEventsResponse = z.infer<typeof SettlementEventsResponse>;

export const SettleOutsideRequest = z.object({ note: z.string().trim().max(300).optional().nullable() });

// ---------- admin ----------
/**
 * Trip status tags (admin view):
 *  active             created, no transactions yet (invites / pre-trip)        blue
 *  ongoing            within the trip dates, or at least one transaction       green
 *  needs_finishing    end date has passed but the owner never finished it     purple
 *  pending_settlement finished; not every transfer confirmed yet              amber
 *  ended              finished and fully settled                              grey
 *  deleted            deleted by the owner                                     red
 */
export const TripTag = z.enum(['active', 'ongoing', 'needs_finishing', 'pending_settlement', 'ended', 'deleted']);
export type TripTag = z.infer<typeof TripTag>;

export const AdminTrip = z.object({
  id: z.string(),
  name: z.string(),
  baseCurrency: z.string(),
  ownerName: z.string(),
  ownerUsername: z.string(),
  memberCount: z.number(),
  expenseCount: z.number(),
  totalSpent: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  createdAt: z.string(),
  tag: TripTag,
  iAmMember: z.boolean(),
});
export type AdminTrip = z.infer<typeof AdminTrip>;
export const AdminTripsResponse = z.object({ trips: z.array(AdminTrip), counts: z.record(z.string(), z.number()) });
export type AdminTripsResponse = z.infer<typeof AdminTripsResponse>;

/** One trip in a user's list on the admin Users tab. */
export const AdminUserTrip = z.object({
  id: z.string(),
  name: z.string(),
  tag: TripTag,
  role: z.enum(['owner', 'member']),
  /** They left (or were removed from) this trip. */
  left: z.boolean(),
});
export type AdminUserTrip = z.infer<typeof AdminUserTrip>;
export const AdminUser = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  isAdmin: z.boolean(),
  createdAt: z.string(),
  /** Last time any of their sessions was used, if ever. */
  lastSeenAt: z.string().nullable(),
  trips: z.array(AdminUserTrip),
});
export type AdminUser = z.infer<typeof AdminUser>;
export const AdminUsersResponse = z.object({ users: z.array(AdminUser) });
export type AdminUsersResponse = z.infer<typeof AdminUsersResponse>;
