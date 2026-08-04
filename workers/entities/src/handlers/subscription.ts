// /subscription — the only entity handler that touches plan/billing state.
// Wraps @synthedge/shared's resolveSubscription/activatePremium/cancelPremium
// so no logic about "is this user free/trial/premium" lives here directly —
// this file is thin routing + request validation only.
import type { Env } from "@synthedge/shared";
import {
  jsonError,
  d1First,
  d1Run,
  nowIso,
  ulid,
  resolveSubscription,
  activateTrial,
  activatePremium,
  cancelPremium,
} from "@synthedge/shared";

interface AuthedUser {
  id: string;
  role: "user" | "admin";
}

// -- GET /subscription -----------------------------------------------------
export async function getSubscription(env: Env, user: AuthedUser): Promise<Response> {
  const state = await resolveSubscription(env, user.id, user.role);
  return Response.json({ ok: true, subscription: state });
}

// -- POST /subscription/trial/activate --------------------------------------
// Idempotent: if a trial window already exists (active or expired), this
// just returns the current state rather than granting a fresh trial.
export async function postActivateTrial(env: Env, user: AuthedUser): Promise<Response> {
  const state = await activateTrial(env, user.id, user.role);
  return Response.json({ ok: true, subscription: state });
}

// -- POST /subscription/cancel ----------------------------------------------
export async function postCancel(env: Env, user: AuthedUser): Promise<Response> {
  const state = await cancelPremium(env, user.id, user.role);
  return Response.json({ ok: true, subscription: state });
}

// -- GET /subscription/payment-records ---------------------------------------
// Owner reads their own history; admins may pass ?userId= to inspect anyone's
// (matches ENTITY_POLICIES.payment_records: admin_gated, read = owner_or_admin).
export async function listPaymentRecords(env: Env, user: AuthedUser, url: URL): Promise<Response> {
  const targetUserId = url.searchParams.get("userId");
  if (targetUserId && targetUserId !== user.id && user.role !== "admin") {
    return jsonError("Forbidden", 403);
  }
  const ownerId = targetUserId || user.id;
  const rows = await env.DB.prepare(
    `SELECT * FROM payment_records WHERE created_by_id = ? ORDER BY created_date DESC LIMIT 100`
  )
    .bind(ownerId)
    .all();
  return Response.json(rows.results ?? []);
}

// -- POST /subscription/payment-records --------------------------------------
// Creates a *pending* payment record — the ledger entry a real checkout flow
// (Stripe/Paynow/EcoCash) would create before redirecting to the provider.
// Does NOT grant access by itself; only POST /subscription/activate does.
interface CreatePaymentRecordBody {
  amount?: number;
  currency?: string;
  method?: "stripe" | "ecocash" | "paynow" | "free";
  billingCycle?: "monthly" | "annual";
  transactionReference?: string;
  notes?: string;
}

const VALID_METHODS = new Set(["stripe", "ecocash", "paynow", "free"]);
const VALID_BILLING_CYCLES = new Set(["monthly", "annual"]);

export async function createPaymentRecord(request: Request, env: Env, user: AuthedUser): Promise<Response> {
  const body = await request.json<CreatePaymentRecordBody>().catch(() => null);
  if (!body || typeof body.amount !== "number" || body.amount <= 0) {
    return jsonError("A positive numeric amount is required", 400);
  }
  if (!body.method || !VALID_METHODS.has(body.method)) {
    return jsonError("A valid payment method is required", 400);
  }
  if (body.billingCycle && !VALID_BILLING_CYCLES.has(body.billingCycle)) {
    return jsonError("billingCycle must be 'monthly' or 'annual'", 400);
  }

  const id = ulid();
  const now = nowIso();
  await d1Run(
    env.DB,
    `INSERT INTO payment_records (id, created_by_id, amount, currency, method, transaction_reference, status, plan, billing_cycle, notes, created_date, updated_date)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 'pro', ?, ?, ?, ?)`,
    id,
    user.id,
    body.amount,
    body.currency ?? "USD",
    body.method,
    body.transactionReference ?? null,
    body.billingCycle ?? null,
    body.notes ?? null,
    now,
    now
  );
  await d1Run(
    env.DB,
    `INSERT INTO payment_audit_log (id, payment_record_id, event, actor, detail, created_date)
     VALUES (?, ?, 'created', 'manual', ?, ?)`,
    ulid(),
    id,
    JSON.stringify({ method: body.method, amount: body.amount }),
    now
  );

  const created = await d1First(env.DB, `SELECT * FROM payment_records WHERE id = ?`, id);
  return Response.json(created, { status: 201 });
}

// -- POST /subscription/activate ----------------------------------------------
// Admin-only. Stands in for what a verified payment webhook would trigger
// automatically once a real provider is wired up — see
// @synthedge/shared's activatePremium() docstring. Marks the referenced
// payment_records row approved and writes the audit trail.
interface ActivateBody {
  userId?: string;
  paymentRecordId?: string;
  billingCycle?: "monthly" | "yearly" | "lifetime";
  paymentMethod?: "stripe" | "ecocash" | "paynow" | "free";
  periodDays?: number;
}

export async function postActivate(request: Request, env: Env, user: AuthedUser): Promise<Response> {
  if (user.role !== "admin") {
    return jsonError("Admin role required to activate a subscription", 403);
  }

  const body = await request.json<ActivateBody>().catch(() => null);
  if (!body?.userId) return jsonError("userId is required", 400);

  const targetUser = await d1First(env.DB, `SELECT id FROM users WHERE id = ?`, body.userId);
  if (!targetUser) return jsonError("User not found", 404);

  let paymentMethod = body.paymentMethod;
  const billingCycle = body.billingCycle ?? "monthly";

  if (body.paymentRecordId) {
    const record = await d1First<{ id: string; created_by_id: string; method: string; status: string }>(
      env.DB,
      `SELECT id, created_by_id, method, status FROM payment_records WHERE id = ?`,
      body.paymentRecordId
    );
    if (!record) return jsonError("Payment record not found", 404);
    if (record.created_by_id !== body.userId) {
      return jsonError("Payment record does not belong to userId", 400);
    }
    if (record.status !== "pending") {
      return jsonError(`Payment record is already '${record.status}'`, 409);
    }
    paymentMethod = paymentMethod ?? (record.method as ActivateBody["paymentMethod"]);
  }

  if (!paymentMethod) return jsonError("paymentMethod is required (or reference a payment record)", 400);

  const periodDays = body.periodDays ?? (billingCycle === "yearly" ? 365 : billingCycle === "lifetime" ? 36500 : 30);

  const state = await activatePremium(env, body.userId, "user", {
    billingCycle,
    paymentMethod,
    periodDays,
    paymentRecordId: body.paymentRecordId,
    actor: "manual",
  });

  return Response.json({ ok: true, subscription: state });
}
