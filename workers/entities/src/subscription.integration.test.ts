// Integration tests for the entities Worker's /subscription routes
// (Milestone 2) — run against the real router (`worker.fetch`), a real
// SQLite DB via fakeD1, and real JWTs.
//
// Also includes the regression test for the security hole this milestone
// closed: PATCH /profile used to let a client write subscription_plan
// directly, which was a full self-service premium bypass.

import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import { createFakeD1, createFakeKV } from "../../shared/src/test-utils/fakeD1";
import type { Env } from "@synthedge/shared";
import { signAccessToken, ulid, nowIso, d1First } from "@synthedge/shared";
import worker from "./index";

const SCHEMA_PATH = path.resolve(__dirname, "../../../db/migrations/0001_init.sql");
const JWT_SECRET = "test-secret-do-not-use-in-prod";

function makeEnv(): Env {
  return {
    DB: createFakeD1(SCHEMA_PATH),
    KV: createFakeKV(),
    JWT_SECRET,
    APP_BASE_URL: "http://localhost:5173",
  } as Env;
}

async function insertUser(env: Env, id: string, role: "user" | "admin" = "user"): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, role, plan, subscription_status, created_date, updated_date)
     VALUES (?, ?, NULL, ?, 'FREE', 'TRIAL', ?, ?)`
  )
    .bind(id, `${id}@example.com`, role, now, now)
    .run();
}

async function insertProfile(env: Env, userId: string): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO trader_profiles (id, created_by_id, subscription_plan, trial_end_date, created_date, updated_date)
     VALUES (?, ?, 'trial', NULL, ?, ?)`
  )
    .bind(ulid(), userId, now, now)
    .run();
}

async function tokenFor(userId: string, role: "user" | "admin" = "user"): Promise<string> {
  return signAccessToken({ sub: userId, role }, JWT_SECRET, 900);
}

function req(method: string, path: string, token: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("Entities Worker — /subscription", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("GET /subscription requires auth", async () => {
    const res = await worker.fetch(req("GET", "/subscription", null), env);
    expect(res.status).toBe(401);
  });

  it("GET /subscription for a fresh user reports tier=trial and initializes the window", async () => {
    const userId = ulid();
    await insertUser(env, userId);
    const token = await tokenFor(userId);

    const res = await worker.fetch(req("GET", "/subscription", token), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { subscription: { tier: string; hasFullAccess: boolean; trialEndDate: string | null } };
    expect(body.subscription.tier).toBe("trial");
    expect(body.subscription.hasFullAccess).toBe(true);
    expect(body.subscription.trialEndDate).not.toBeNull();
  });

  it("POST /subscription/trial/activate is idempotent", async () => {
    const userId = ulid();
    await insertUser(env, userId);
    const token = await tokenFor(userId);

    const first = await worker.fetch(req("POST", "/subscription/trial/activate", token), env);
    const firstBody = (await first.json()) as { subscription: { trialEndDate: string } };
    const second = await worker.fetch(req("POST", "/subscription/trial/activate", token), env);
    const secondBody = (await second.json()) as { subscription: { trialEndDate: string } };

    expect(secondBody.subscription.trialEndDate).toBe(firstBody.subscription.trialEndDate);
  });

  it("POST /subscription/payment-records creates a pending record owned by the caller", async () => {
    const userId = ulid();
    await insertUser(env, userId);
    const token = await tokenFor(userId);

    const res = await worker.fetch(
      req("POST", "/subscription/payment-records", token, {
        amount: 9.99,
        method: "ecocash",
        billingCycle: "monthly",
      }),
      env
    );
    expect(res.status).toBe(201);
    const record = (await res.json()) as { status: string; created_by_id: string };
    expect(record.status).toBe("pending");
    expect(record.created_by_id).toBe(userId);
  });

  it("POST /subscription/activate is rejected for a non-admin caller", async () => {
    const userId = ulid();
    await insertUser(env, userId);
    const token = await tokenFor(userId);

    const res = await worker.fetch(
      req("POST", "/subscription/activate", token, { userId, paymentMethod: "paynow" }),
      env
    );
    expect(res.status).toBe(403);

    // And access must genuinely be unaffected — not just the response code.
    const check = await worker.fetch(req("GET", "/subscription", token), env);
    const checkBody = (await check.json()) as { subscription: { tier: string } };
    expect(checkBody.subscription.tier).not.toBe("premium");
  });

  it("POST /subscription/activate by an admin grants the target user premium", async () => {
    const userId = ulid();
    await insertUser(env, userId);
    const adminId = ulid();
    await insertUser(env, adminId, "admin");
    const adminToken = await tokenFor(adminId, "admin");

    const activateRes = await worker.fetch(
      req("POST", "/subscription/activate", adminToken, {
        userId,
        paymentMethod: "paynow",
        billingCycle: "monthly",
      }),
      env
    );
    expect(activateRes.status).toBe(200);

    // Verify from the USER's own perspective, not just the admin response.
    const userToken = await tokenFor(userId);
    const check = await worker.fetch(req("GET", "/subscription", userToken), env);
    const checkBody = (await check.json()) as { subscription: { tier: string; hasFullAccess: boolean } };
    expect(checkBody.subscription.tier).toBe("premium");
    expect(checkBody.subscription.hasFullAccess).toBe(true);
  });

  it("full lifecycle: pending payment record -> admin activation via that record -> approved + premium", async () => {
    const userId = ulid();
    await insertUser(env, userId);
    const userToken = await tokenFor(userId);
    const adminId = ulid();
    await insertUser(env, adminId, "admin");
    const adminToken = await tokenFor(adminId, "admin");

    const createRes = await worker.fetch(
      req("POST", "/subscription/payment-records", userToken, { amount: 9.99, method: "ecocash", billingCycle: "monthly" }),
      env
    );
    const record = (await createRes.json()) as { id: string };

    const activateRes = await worker.fetch(
      req("POST", "/subscription/activate", adminToken, { userId, paymentRecordId: record.id, billingCycle: "monthly" }),
      env
    );
    expect(activateRes.status).toBe(200);

    const recordRow = await d1First<{ status: string }>(env.DB, `SELECT status FROM payment_records WHERE id = ?`, record.id);
    expect(recordRow?.status).toBe("approved");

    const check = await worker.fetch(req("GET", "/subscription", userToken), env);
    const checkBody = (await check.json()) as { subscription: { tier: string } };
    expect(checkBody.subscription.tier).toBe("premium");
  });

  it("POST /subscription/cancel downgrades an active premium user back to free", async () => {
    const userId = ulid();
    await insertUser(env, userId);
    const adminId = ulid();
    await insertUser(env, adminId, "admin");
    const adminToken = await tokenFor(adminId, "admin");
    await worker.fetch(req("POST", "/subscription/activate", adminToken, { userId, paymentMethod: "paynow" }), env);

    const userToken = await tokenFor(userId);
    const cancelRes = await worker.fetch(req("POST", "/subscription/cancel", userToken), env);
    expect(cancelRes.status).toBe(200);

    const check = await worker.fetch(req("GET", "/subscription", userToken), env);
    const checkBody = (await check.json()) as { subscription: { tier: string } };
    expect(checkBody.subscription.tier).toBe("free");
  });

  it("SECURITY REGRESSION: PATCH /profile can no longer be used to self-grant a plan", async () => {
    const userId = ulid();
    await insertUser(env, userId);
    await insertProfile(env, userId);
    const token = await tokenFor(userId);

    // Confirm starting tier is trial (not yet premium).
    const before = await worker.fetch(req("GET", "/subscription", token), env);
    const beforeBody = (await before.json()) as { subscription: { tier: string } };
    expect(beforeBody.subscription.tier).toBe("trial");

    // The exact attack this milestone closes: try to write subscription_plan
    // directly via PATCH /profile.
    const patchRes = await worker.fetch(
      req("PATCH", "/profile", token, { subscription_plan: "pro", trial_end_date: null }),
      env
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as Record<string, unknown>;
    // The field must not have been accepted/echoed back as changed.
    expect(patched.subscription_plan).not.toBe("pro");

    // And critically: actual access must be unaffected.
    const after = await worker.fetch(req("GET", "/subscription", token), env);
    const afterBody = (await after.json()) as { subscription: { tier: string } };
    expect(afterBody.subscription.tier).not.toBe("premium");
  });
});
