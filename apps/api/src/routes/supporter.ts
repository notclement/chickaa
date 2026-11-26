import { withPayNowReference, payNowAmount } from '@chickaa/core';
import type { SupporterPayNowResponse } from '@chickaa/contracts';
import { Hono } from 'hono';
import { currentUser, requireAuth } from '../auth/session.ts';
import { HttpError } from '../lib/http.ts';
import type { Env } from '../lib/types.ts';
import { ensureReferralCode } from '../lib/users.ts';

export const supporterRoutes = new Hono<Env>();
supporterRoutes.use('*', requireAuth);

/**
 * The owner's PayNow QR with this user's reference (CHICKAA-<code>) added, so the payment can be
 * matched to the account. The QR text lives in PAYNOW_QR_PAYLOAD, never in the repo.
 */
supporterRoutes.get('/paynow', async (c) => {
  const base = c.var.config.payNowPayload;
  if (!base) throw new HttpError(404, 'NOT_FOUND', 'Supporting isn’t set up yet');
  const reference = `CHICKAA-${await ensureReferralCode(c.var.db, currentUser(c).id)}`;
  const res: SupporterPayNowResponse = { payload: withPayNowReference(base, reference), reference, amount: payNowAmount(base) };
  c.header('Cache-Control', 'private, no-store');
  return c.json(res);
});
