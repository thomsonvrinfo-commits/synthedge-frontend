// SynthEdge — Centralized subscription state.
//
// AUDIT CONTEXT (Milestone 2): before this file existed, subscription/plan
// state was read from THREE different places that could disagree with each
// other:
//   1. `users` (plan, subscription_status, trial_*, subscription_*) — fully
//      modeled, populated at registration by workers/auth, but never read by
//      anything except the never-actually-initializing `/users/init-trial`.
//   2. `trader_profiles.subscription_plan` / `trial_end_date` — what the
//      frontend's useSubscription() hook and (as of Milestone 1)
//      workers/candles-worker actually checked.
//   3. `user_subscriptions` — a properly-normalized plan/billing ledger
//      table with a `status` and `expires_at`, defined in the schema and
//      covered by authorize.ts's policy table, but never written to or read
//      by any handler.
// Worse, `PATCH /profile` allowed a client to write `subscription_plan`
// directly (see workers/entities/src/handlers/profile.ts's prior
// SIMPLE_UPDATABLE_FIELDS) — i.e. any authenticated user could grant
// themselves "pro" with a single API call. That's closed as part of this
// module: `trader_profiles.subscription_plan`/`trial_end_date` are no longer
// client-writable anywhere; they're a read-only mirror this module keeps in
// sync purely for the existing frontend hook's convenience.
//
// This file makes `users` the single authoritative table for a user's
// *current* entitlement (every Worker already has the user's id from the
// JWT — no extra join needed), and `user_subscriptions` + `payment_records`
// + `payment_audit_log` the durable ledger of paid periods and the payments
// that funded them (written only by activatePremium/cancelPremium below).
// No schema changes were needed — every table already existed for exactly
// this purpose; they just weren't wired together.
//
// Every Worker that needs to know "is this user allowed to do X" should
// call `resolveSubscription()` — never re-derive plan/trial/expiry logic
// locally (that duplication is exactly what caused the drift above).

import type { Env, Role } from "./types";
import { d1First, d1Run, nowIso, ulid, addDays } from "./db";

export type SubscriptionTier = "free" | "trial" | "premium";

export interface SubscriptionState {
  userId: string;
  tier: SubscriptionTier;
  hasFullAccess: boolean; // trial (active), premium, or admin
  isAdmin: boolean;
  subscriptionStatus: "TRIAL" | "ACTIVE" | "EXPIRED" | "CANCELLED";
  plan: "FREE" | "EARLY_ACCESS";
  trialStartDate: string | null;
  trialEndDate: string | null;
  trialDaysLeft: number;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  billingCycle: "monthly" | "yearly" | "lifetime" | null;
}

interface UserSubscriptionRow {
  plan: "FREE" | "EARLY_ACCESS";
  subscription_status: "TRIAL" | "ACTIVE" | "EXPIRED" | "CANCELLED";
  trial_start_date: string | null;
  trial_end_date: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
}

const TRIAL_LENGTH_DAYS = 7;

function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  const diffMs = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/** Best-effort mirror write to trader_profiles for the existing frontend hook. Never throws. */
async function syncTraderProfileMirror(
  env: Env,
  userId: string,
  subscriptionPlan: "trial" | "pro" | "free",
  trialEndDate: string | null
): Promise<void> {
  try {
    await d1Run(
      env.DB,
      `UPDATE trader_profiles SET subscription_plan = ?, trial_end_date = ?, updated_date = ? WHERE created_by_id = ?`,
      subscriptionPlan,
      trialEndDate,
      nowIso(),
      userId
    );
  } catch {
    // trader_profiles row may not exist yet (fresh signup, onboarding not
    // completed) — that's fine, it gets created with correct values later
    // and isn't the source of truth anyway.
  }
}

function tierToMirrorPlan(tier: SubscriptionTier): "trial" | "pro" | "free" {
  if (tier === "premium") return "pro";
  if (tier === "trial") return "trial";
  return "free";
}

/**
 * The single source of truth for "what can this user currently access."
 * Handles lazy state transitions (trial window auto-initialized on first
 * read if missing; expired trial/subscription auto-downgraded to free) so
 * no cron job is required to keep `users` accurate — every read
 * self-heals the row if it's stale.
 */
export async function resolveSubscription(env: Env, userId: string, role: Role): Promise<SubscriptionState> {
  let user = await d1First<UserSubscriptionRow>(
    env.DB,
    `SELECT plan, subscription_status, trial_start_date, trial_end_date, subscription_start_date, subscription_end_date
     FROM users WHERE id = ?`,
    userId
  );

  if (!user) {
    // Defensive default — should not happen given the FK, but never throw
    // out of an access-control check; fail closed to free tier.
    return {
      userId,
      tier: "free",
      hasFullAccess: role === "admin",
      isAdmin: role === "admin",
      subscriptionStatus: "EXPIRED",
      plan: "FREE",
      trialStartDate: null,
      trialEndDate: null,
      trialDaysLeft: 0,
      subscriptionStartDate: null,
      subscriptionEndDate: null,
      billingCycle: null,
    };
  }

  const now = Date.now();

  // Lazily initialize the trial window the very first time it's checked —
  // this is what "activating a trial" means in practice: registration sets
  // subscription_status='TRIAL' but (today) never sets the window itself.
  if (user.subscription_status === "TRIAL" && !user.trial_end_date) {
    const start = nowIso();
    const end = addDays(new Date(), TRIAL_LENGTH_DAYS).toISOString();
    await d1Run(
      env.DB,
      `UPDATE users SET trial_start_date = ?, trial_end_date = ?, updated_date = ? WHERE id = ?`,
      start,
      end,
      nowIso(),
      userId
    );
    user = { ...user, trial_start_date: start, trial_end_date: end };
  }

  // Auto-expire an active premium subscription whose period has ended.
  if (
    user.subscription_status === "ACTIVE" &&
    user.subscription_end_date &&
    new Date(user.subscription_end_date).getTime() <= now
  ) {
    await d1Run(
      env.DB,
      `UPDATE users SET subscription_status = 'EXPIRED', updated_date = ? WHERE id = ?`,
      nowIso(),
      userId
    );
    user = { ...user, subscription_status: "EXPIRED" };
    await syncTraderProfileMirror(env, userId, "free", user.trial_end_date);
  }

  // Auto-expire a trial whose window has passed.
  if (
    user.subscription_status === "TRIAL" &&
    user.trial_end_date &&
    new Date(user.trial_end_date).getTime() <= now
  ) {
    await d1Run(
      env.DB,
      `UPDATE users SET subscription_status = 'EXPIRED', updated_date = ? WHERE id = ?`,
      nowIso(),
      userId
    );
    user = { ...user, subscription_status: "EXPIRED" };
    await syncTraderProfileMirror(env, userId, "free", user.trial_end_date);
  }

  const isAdmin = role === "admin";

  let tier: SubscriptionTier;
  if (isAdmin) {
    tier = "premium";
  } else if (user.subscription_status === "ACTIVE") {
    tier = "premium";
  } else if (user.subscription_status === "TRIAL") {
    tier = "trial";
  } else {
    tier = "free"; // EXPIRED or CANCELLED
  }

  // Keep the mirror in sync even on the common "nothing changed" path, so
  // it never silently drifts from the authoritative state (cheap: same
  // table the frontend already fetches every page load).
  if (!isAdmin) {
    await syncTraderProfileMirror(env, userId, tierToMirrorPlan(tier), user.trial_end_date);
  }

  let billingCycle: SubscriptionState["billingCycle"] = null;
  if (tier === "premium" && !isAdmin) {
    const sub = await d1First<{ billing_cycle: SubscriptionState["billingCycle"] }>(
      env.DB,
      `SELECT billing_cycle FROM user_subscriptions WHERE created_by_id = ? AND status = 'active' ORDER BY created_date DESC LIMIT 1`,
      userId
    );
    billingCycle = sub?.billing_cycle ?? null;
  }

  return {
    userId,
    tier,
    hasFullAccess: tier === "trial" || tier === "premium",
    isAdmin,
    subscriptionStatus: user.subscription_status,
    plan: user.plan,
    trialStartDate: user.trial_start_date,
    trialEndDate: user.trial_end_date,
    trialDaysLeft: user.subscription_status === "TRIAL" ? daysLeft(user.trial_end_date) : 0,
    subscriptionStartDate: user.subscription_start_date,
    subscriptionEndDate: user.subscription_end_date,
    billingCycle,
  };
}

/** Explicit trial activation — idempotent, safe to call repeatedly (e.g. from a "start trial" button). */
export async function activateTrial(env: Env, userId: string, role: Role): Promise<SubscriptionState> {
  return resolveSubscription(env, userId, role);
}

export interface ActivatePremiumInput {
  billingCycle: "monthly" | "yearly" | "lifetime";
  paymentMethod: "stripe" | "ecocash" | "paynow" | "free";
  periodDays: number;
  /** Optional payment_records row this activation fulfills; marked approved and audit-logged if provided. */
  paymentRecordId?: string;
  /** 'manual' | 'webhook' | 'system' — who/what triggered this, for the audit log. */
  actor?: "manual" | "webhook" | "system";
}

/**
 * Grants premium access. This is deliberately the ONLY function that writes
 * `subscription_status = 'ACTIVE'` anywhere in the codebase — a future
 * Stripe/Paynow/EcoCash webhook Worker calls exactly this function (or the
 * `POST /subscription/activate` route that wraps it) after independently
 * verifying payment; nothing about the replay engine, journal, or any other
 * feature needs to change when a new payment provider is added.
 */
export async function activatePremium(
  env: Env,
  userId: string,
  role: Role,
  input: ActivatePremiumInput
): Promise<SubscriptionState> {
  const now = nowIso();
  const startedAt = now;
  const expiresAt = addDays(new Date(), input.periodDays).toISOString();

  await d1Run(
    env.DB,
    `UPDATE users
     SET subscription_status = 'ACTIVE',
         subscription_start_date = ?,
         subscription_end_date = ?,
         payment_provider = ?,
         last_payment_date = ?,
         next_billing_date = ?,
         updated_date = ?
     WHERE id = ?`,
    startedAt,
    expiresAt,
    input.paymentMethod,
    now,
    expiresAt,
    now,
    userId
  );

  await d1Run(
    env.DB,
    `INSERT INTO user_subscriptions (id, created_by_id, plan, status, role, billing_cycle, started_at, expires_at, payment_method, created_date, updated_date)
     VALUES (?, ?, 'pro', 'active', 'user', ?, ?, ?, ?, ?, ?)`,
    ulid(),
    userId,
    input.billingCycle,
    startedAt,
    expiresAt,
    input.paymentMethod,
    now,
    now
  );

  if (input.paymentRecordId) {
    await d1Run(
      env.DB,
      `UPDATE payment_records SET status = 'approved', reviewed_at = ?, updated_date = ? WHERE id = ? AND created_by_id = ?`,
      now,
      now,
      input.paymentRecordId,
      userId
    );
    await d1Run(
      env.DB,
      `INSERT INTO payment_audit_log (id, payment_record_id, event, actor, detail, created_date)
       VALUES (?, ?, 'activated', ?, ?, ?)`,
      ulid(),
      input.paymentRecordId,
      input.actor ?? "manual",
      JSON.stringify({ billingCycle: input.billingCycle, expiresAt }),
      now
    );
  }

  await syncTraderProfileMirror(env, userId, "pro", null);

  return resolveSubscription(env, userId, role);
}

/** Cancels an active premium subscription immediately (no partial-period proration in this milestone). */
export async function cancelPremium(env: Env, userId: string, role: Role): Promise<SubscriptionState> {
  const now = nowIso();
  await d1Run(
    env.DB,
    `UPDATE users SET subscription_status = 'CANCELLED', updated_date = ? WHERE id = ?`,
    now,
    userId
  );
  await d1Run(
    env.DB,
    `UPDATE user_subscriptions SET status = 'expired', updated_date = ? WHERE created_by_id = ? AND status = 'active'`,
    now,
    userId
  );
  await syncTraderProfileMirror(env, userId, "free", null);
  return resolveSubscription(env, userId, role);
}
