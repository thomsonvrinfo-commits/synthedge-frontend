// Integration tests for the centralized subscription module. Runs against a
// real SQLite DB (fakeD1, same schema as production D1) — not mocks — so
// these prove the actual SQL and transition logic, not just the TypeScript.

import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import { createFakeD1 } from "./test-utils/fakeD1";
import type { Env } from "./types";
import { d1First, d1Run, nowIso, ulid } from "./db";
import { resolveSubscription, activateTrial, activatePremium, cancelPremium } from "./subscription";

const SCHEMA_PATH = path.resolve(__dirname, "../../../db/migrations/0001_init.sql");

function makeEnv(): Env {
  return {
    DB: createFakeD1(SCHEMA_PATH),
    KV: undefined as unknown as KVNamespace,
    JWT_SECRET: "test-secret",
    APP_BASE_URL: "http://localhost:5173",
  } as Env;
}

async function insertUser(env: Env, overrides: Partial<Record<string, unknown>> = {}): Promise<string> {
  const id = ulid();
  const now = nowIso();
  const defaults: Record<string, unknown> = {
    role: "user",
    plan: "FREE",
    subscription_status: "TRIAL",
    trial_start_date: null,
    trial_end_date: null,
    subscription_start_date: null,
    subscription_end_date: null,
  };
  const fields = { ...defaults, ...overrides };
  await d1Run(
    env.DB,
    `INSERT INTO users (id, email, password_hash, role, plan, subscription_status, trial_start_date, trial_end_date, subscription_start_date, subscription_end_date, created_date, updated_date)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    `${id}@example.com`,
    fields.role,
    fields.plan,
    fields.subscription_status,
    fields.trial_start_date,
    fields.trial_end_date,
    fields.subscription_start_date,
    fields.subscription_end_date,
    now,
    now
  );
  return id;
}

describe("resolveSubscription — new user lifecycle", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("a freshly registered user (TRIAL, no trial window yet) resolves to tier=trial and initializes the window", async () => {
    const userId = await insertUser(env);
    const state = await resolveSubscription(env, userId, "user");

    expect(state.tier).toBe("trial");
    expect(state.hasFullAccess).toBe(true);
    expect(state.trialStartDate).not.toBeNull();
    expect(state.trialEndDate).not.toBeNull();
    expect(state.trialDaysLeft).toBeGreaterThan(0);

    // The window must actually be persisted, not just returned in-memory.
    const row = await d1First<{ trial_end_date: string | null }>(
      env.DB,
      `SELECT trial_end_date FROM users WHERE id = ?`,
      userId
    );
    expect(row?.trial_end_date).not.toBeNull();
  });

  it("resolving twice does not reset an already-initialized trial window", async () => {
    const userId = await insertUser(env);
    const first = await resolveSubscription(env, userId, "user");
    const second = await resolveSubscription(env, userId, "user");
    expect(second.trialEndDate).toBe(first.trialEndDate);
  });

  it("an expired trial auto-downgrades to free on read", async () => {
    const expired = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const userId = await insertUser(env, {
      trial_start_date: new Date(Date.now() - 8 * 86400 * 1000).toISOString(),
      trial_end_date: expired,
    });

    const state = await resolveSubscription(env, userId, "user");
    expect(state.tier).toBe("free");
    expect(state.hasFullAccess).toBe(false);
    expect(state.subscriptionStatus).toBe("EXPIRED");

    // Persisted, not just computed for this one response.
    const row = await d1First<{ subscription_status: string }>(
      env.DB,
      `SELECT subscription_status FROM users WHERE id = ?`,
      userId
    );
    expect(row?.subscription_status).toBe("EXPIRED");
  });

  it("a user with subscription_status CANCELLED resolves to free", async () => {
    const userId = await insertUser(env, { subscription_status: "CANCELLED" });
    const state = await resolveSubscription(env, userId, "user");
    expect(state.tier).toBe("free");
    expect(state.hasFullAccess).toBe(false);
  });

  it("admin role always resolves to premium/full access regardless of DB state", async () => {
    const userId = await insertUser(env, { subscription_status: "CANCELLED" });
    const state = await resolveSubscription(env, userId, "admin");
    expect(state.tier).toBe("premium");
    expect(state.hasFullAccess).toBe(true);
    expect(state.isAdmin).toBe(true);
  });

  it("resolving for a nonexistent user fails closed to free, not open to premium", async () => {
    const state = await resolveSubscription(env, "does-not-exist", "user");
    expect(state.tier).toBe("free");
    expect(state.hasFullAccess).toBe(false);
  });
});

describe("activateTrial", () => {
  it("is idempotent — calling it after the window is already set doesn't change trial_end_date", async () => {
    const env = makeEnv();
    const userId = await insertUser(env);
    const first = await activateTrial(env, userId, "user");
    const second = await activateTrial(env, userId, "user");
    expect(second.trialEndDate).toBe(first.trialEndDate);
  });
});

describe("activatePremium / cancelPremium — the paid lifecycle", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("grants premium, writes a user_subscriptions ledger row, and updates users", async () => {
    const userId = await insertUser(env);

    const state = await activatePremium(env, userId, "user", {
      billingCycle: "monthly",
      paymentMethod: "paynow",
      periodDays: 30,
    });

    expect(state.tier).toBe("premium");
    expect(state.hasFullAccess).toBe(true);
    expect(state.subscriptionStatus).toBe("ACTIVE");
    expect(state.billingCycle).toBe("monthly");

    const ledgerRow = await d1First<{ plan: string; status: string; payment_method: string }>(
      env.DB,
      `SELECT plan, status, payment_method FROM user_subscriptions WHERE created_by_id = ?`,
      userId
    );
    expect(ledgerRow?.plan).toBe("pro");
    expect(ledgerRow?.status).toBe("active");
    expect(ledgerRow?.payment_method).toBe("paynow");
  });

  it("a subsequent resolveSubscription call still reports premium (not re-derived incorrectly)", async () => {
    const userId = await insertUser(env);
    await activatePremium(env, userId, "user", { billingCycle: "yearly", paymentMethod: "stripe", periodDays: 365 });
    const state = await resolveSubscription(env, userId, "user");
    expect(state.tier).toBe("premium");
  });

  it("an approved payment record is marked approved and audit-logged on activation", async () => {
    const userId = await insertUser(env);
    const recordId = ulid();
    const now = nowIso();
    await d1Run(
      env.DB,
      `INSERT INTO payment_records (id, created_by_id, amount, currency, method, status, plan, billing_cycle, created_date, updated_date)
       VALUES (?, ?, 9.99, 'USD', 'ecocash', 'pending', 'pro', 'monthly', ?, ?)`,
      recordId,
      userId,
      now,
      now
    );

    await activatePremium(env, userId, "user", {
      billingCycle: "monthly",
      paymentMethod: "ecocash",
      periodDays: 30,
      paymentRecordId: recordId,
      actor: "manual",
    });

    const record = await d1First<{ status: string }>(env.DB, `SELECT status FROM payment_records WHERE id = ?`, recordId);
    expect(record?.status).toBe("approved");

    const auditRows = await env.DB.prepare(
      `SELECT event, actor FROM payment_audit_log WHERE payment_record_id = ?`
    )
      .bind(recordId)
      .all<{ event: string; actor: string }>();
    expect(auditRows.results?.some((r) => r.event === "activated" && r.actor === "manual")).toBe(true);
  });

  it("premium expires automatically when subscription_end_date has passed", async () => {
    const userId = await insertUser(env);
    await activatePremium(env, userId, "user", { billingCycle: "monthly", paymentMethod: "paynow", periodDays: 30 });

    // Simulate time passing: backdate the expiry.
    await d1Run(
      env.DB,
      `UPDATE users SET subscription_end_date = ? WHERE id = ?`,
      new Date(Date.now() - 1000).toISOString(),
      userId
    );

    const state = await resolveSubscription(env, userId, "user");
    expect(state.tier).toBe("free");
    expect(state.subscriptionStatus).toBe("EXPIRED");
  });

  it("cancelPremium immediately downgrades to free and closes the ledger row", async () => {
    const userId = await insertUser(env);
    await activatePremium(env, userId, "user", { billingCycle: "monthly", paymentMethod: "paynow", periodDays: 30 });

    const state = await cancelPremium(env, userId, "user");
    expect(state.tier).toBe("free");
    expect(state.subscriptionStatus).toBe("CANCELLED");

    const ledgerRow = await d1First<{ status: string }>(
      env.DB,
      `SELECT status FROM user_subscriptions WHERE created_by_id = ?`,
      userId
    );
    expect(ledgerRow?.status).toBe("expired");
  });
});
