// Integration tests for the candles Worker's subscription-enforcement
// milestone. Runs the real worker `fetch()` handler against a real SQLite
// DB (via the fakeD1 harness, same schema as production) and a fake R2
// bucket seeded with real gzip-compressed candle fixtures — not mocks of
// the worker's internals.
//
// Milestone 2 update: subscription state now comes from the centralized
// @synthedge/shared resolveSubscription()/activatePremium(), which reads
// `users` (not `trader_profiles`, which Milestone 1 originally checked
// directly) — these tests seed `users` accordingly, and use the real
// activatePremium() helper for the paid-plan cases so they exercise the
// same code path production actually runs.
//
// What these prove:
//   1. Free-tier users are hard-capped at the latest 1,000 candles, no
//      matter what date range they request.
//   2. Premium (pro or active-trial) users get their requested custom
//      date range honored.
//   3. The restriction is enforced on the backend and cannot be bypassed
//      by a crafted direct API request (old `from`/`to`, or omitting them).
//   4. Unauthenticated requests are rejected outright.
//   5. This Worker's access decision matches the centralized subscription
//      state exactly — it has no subscription logic of its own left.

import { describe, it, expect, beforeEach } from "vitest";
import { parquetWriteBuffer } from "hyparquet-writer";
import path from "node:path";
import {
  createFakeD1,
  createFakeR2,
  createFakeKV
} from "../../shared/src/test-utils/fakeD1";
import type { Env } from "@synthedge/shared";
import { signAccessToken, ulid, nowIso, activatePremium } from "@synthedge/shared";
import worker from "./index";

const SCHEMA_PATH = path.resolve(__dirname, "../../../db/migrations");
const JWT_SECRET = "test-secret-do-not-use-in-prod";
const SYMBOL = "Volatility 10 Index";
const FOLDER = "volatility-10";

interface RawCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function makeEnv(): Env {
  return {
    DB: createFakeD1(SCHEMA_PATH),
    BUCKET: createFakeR2(),
    KV: createFakeKV(),
    JWT_SECRET,
    APP_BASE_URL: "http://localhost:5173",
  } as Env;
}

/** Generates one M1 candle per minute for `count` minutes ending at `endEpoch`. */
function generateM1Candles(endEpoch: number, count: number): RawCandle[] {
  const candles: RawCandle[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const timestamp = endEpoch - i * 60;
    candles.push({ timestamp, open: 100, high: 101, low: 99, close: 100.5, volume: 10 });
  }
  return candles;
}

/** Seeds the fake R2 bucket exactly like the real pipeline: gzip JSON, grouped by UTC month. */
async function seedR2(
  env: Env,
  folder: string,
  candles: RawCandle[]
): Promise<void> {
  const byMonth = new Map<string, RawCandle[]>();

  for (const c of candles) {
    const month = new Date(c.timestamp * 1000)
      .toISOString()
      .slice(0, 7);

    if (!byMonth.has(month)) {
      byMonth.set(month, []);
    }

    byMonth.get(month)!.push(c);
  }

  const r2 = env.BUCKET as unknown as {
    __put: (key: string, buffer: ArrayBuffer) => void;
  };

  for (const [month, monthCandles] of byMonth) {
    const key = `${folder}/m1/${month}.parquet`;

   const buffer = parquetWriteBuffer({
  columnData: [
    {
      name: "timestamp",
      data: monthCandles.map((c) => new Date(c.timestamp * 1000)),
      type: "TIMESTAMP",
    },
    {
      name: "open",
      data: monthCandles.map((c) => c.open),
      type: "DOUBLE",
    },
    {
      name: "high",
      data: monthCandles.map((c) => c.high),
      type: "DOUBLE",
    },
    {
      name: "low",
      data: monthCandles.map((c) => c.low),
      type: "DOUBLE",
    },
    {
      name: "close",
      data: monthCandles.map((c) => c.close),
      type: "DOUBLE",
    },
    {
      name: "tick_volume",
      data: monthCandles.map((c) => BigInt(c.volume)),
      type: "INT64",
    },
    {
      name: "spread",
      data: monthCandles.map(() => BigInt(1000)),
      type: "INT64",
    },
  ],
});

    r2.__put(key, buffer);
  }
}

interface UserOverrides {
  subscription_status?: "TRIAL" | "ACTIVE" | "EXPIRED" | "CANCELLED";
  trial_end_date?: string | null;
}

/** Inserts a `users` row — the actual source of truth resolveSubscription() reads. */
async function insertUser(env: Env, id: string, overrides: UserOverrides = {}): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, role, plan, subscription_status, trial_end_date, created_date, updated_date)
     VALUES (?, ?, NULL, 'user', 'FREE', ?, ?, ?, ?)`
  )
    .bind(id, `${id}@example.com`, overrides.subscription_status ?? "TRIAL", overrides.trial_end_date ?? null, now, now)
    .run();
}

async function tokenFor(userId: string, role: "user" | "admin" = "user"): Promise<string> {
  return signAccessToken({ sub: userId, role }, JWT_SECRET, 900);
}

function candlesRequest(token: string | null, query: Record<string, string>): Request {
  const url = new URL("http://localhost/candles");
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request(url.toString(), { headers });
}

describe("Candles Worker — subscription enforcement", () => {
  let env: Env;
  const nowEpoch = Math.floor(Date.now() / 1000);

  beforeEach(async () => {
    env = makeEnv();
    // 3,000 minutes (50 hours) of recent M1 candles — enough to prove the
    // free tier is clamped to 1,000 even though far more is available.
    const recent = generateM1Candles(nowEpoch, 3000);
    // Plus a separate, older block (60-90 days ago) that only a premium
    // custom date-range request should ever be able to reach.
    const old = generateM1Candles(nowEpoch - 75 * 86400, 500);
    await seedR2(env, FOLDER, [...old, ...recent]);
  });

  it("rejects requests with no token", async () => {
    const res = await worker.fetch(candlesRequest(null, { symbol: SYMBOL, timeframe: "M1" }), env);
    expect(res.status).toBe(401);
  });

  it("rejects requests with an invalid token", async () => {
    const res = await worker.fetch(
      candlesRequest("not-a-real-token", { symbol: SYMBOL, timeframe: "M1" }),
      env
    );
    expect(res.status).toBe(401);
  });

  it("free-plan user (subscription EXPIRED): always capped at the latest 1,000 candles, regardless of requested range", async () => {
    const userId = ulid();
    await insertUser(env, userId, { subscription_status: "EXPIRED" });
    const token = await tokenFor(userId);

    // Attacker-style request: ask for a huge historical window reaching
    // back well before the fixture data even starts.
    const res = await worker.fetch(
      candlesRequest(token, {
        symbol: SYMBOL,
        timeframe: "M1",
        from: "0",
        to: String(nowEpoch),
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan: string; restricted: boolean; count: number; candles: RawCandle[] };

    expect(body.plan).toBe("free");
    expect(body.restricted).toBe(true);
    expect(body.count).toBeLessThanOrEqual(1000);
    expect(body.candles.length).toBeLessThanOrEqual(1000);

    // The returned candles must be the *recent* ones, not the old 75-days-ago
    // block — proving the requested `from=0` was ignored, not honored.
    const oldestReturned = body.candles[0]!.timestamp;
    expect(oldestReturned).toBeGreaterThan(nowEpoch - 75 * 86400);
  });

  it("free-plan user cannot bypass the cap by omitting from/to entirely", async () => {
    const userId = ulid();
    await insertUser(env, userId, { subscription_status: "CANCELLED" });
    const token = await tokenFor(userId);

    const res = await worker.fetch(candlesRequest(token, { symbol: SYMBOL, timeframe: "M1" }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number; restricted: boolean };
    expect(body.restricted).toBe(true);
    expect(body.count).toBeLessThanOrEqual(1000);
  });

  it("free-plan user cannot bypass the cap by picking a large aggregated timeframe", async () => {
    // Even at D1 (daily) aggregation, the post-aggregation clamp must still
    // hold the response to 1,000 bars.
    const userId = ulid();
    await insertUser(env, userId, { subscription_status: "EXPIRED" });
    const token = await tokenFor(userId);

    const res = await worker.fetch(
      candlesRequest(token, { symbol: SYMBOL, timeframe: "D1", from: "0", to: String(nowEpoch) }),
      env
    );
    const body = (await res.json()) as { count: number };
    expect(body.count).toBeLessThanOrEqual(1000);
  });

  it("user with an expired trial is auto-downgraded and treated as free-tier (restricted)", async () => {
    const userId = ulid();
    const expired = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await insertUser(env, userId, { subscription_status: "TRIAL", trial_end_date: expired });
    const token = await tokenFor(userId);

    const res = await worker.fetch(
      candlesRequest(token, { symbol: SYMBOL, timeframe: "M1", from: "0", to: String(nowEpoch) }),
      env
    );
    const body = (await res.json()) as { plan: string; restricted: boolean; count: number };
    expect(body.plan).toBe("free");
    expect(body.restricted).toBe(true);
    expect(body.count).toBeLessThanOrEqual(1000);
  });

  it("a brand-new user (just registered, trial window not yet initialized) is lazily granted a trial — not treated as free", async () => {
    // Mirrors exactly what workers/auth's register.ts inserts: subscription_status
    // = 'TRIAL' but no trial_start_date/trial_end_date yet. The centralized
    // resolver must self-initialize the window rather than fail closed.
    const userId = ulid();
    await insertUser(env, userId); // defaults: TRIAL, no trial_end_date
    const token = await tokenFor(userId);

    const from = nowEpoch - 76 * 86400;
    const to = nowEpoch - 74 * 86400;
    const res = await worker.fetch(
      candlesRequest(token, { symbol: SYMBOL, timeframe: "M1", from: String(from), to: String(to) }),
      env
    );
    const body = (await res.json()) as { plan: string; restricted: boolean };
    expect(body.plan).toBe("trial");
    expect(body.restricted).toBe(false);
  });

  it("active-trial user gets full (premium-equivalent) access with a custom date range", async () => {
    const userId = ulid();
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    await insertUser(env, userId, { subscription_status: "TRIAL", trial_end_date: future });
    const token = await tokenFor(userId);

    const from = nowEpoch - 76 * 86400;
    const to = nowEpoch - 74 * 86400;
    const res = await worker.fetch(
      candlesRequest(token, { symbol: SYMBOL, timeframe: "M1", from: String(from), to: String(to) }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan: string; restricted: boolean; candles: RawCandle[] };
    expect(body.plan).toBe("trial");
    expect(body.restricted).toBe(false);
    // Should reach the old 75-days-ago fixture block, which the free tier
    // could never see.
    expect(body.candles.length).toBeGreaterThan(0);
    for (const c of body.candles) {
      expect(c.timestamp).toBeGreaterThanOrEqual(from);
      expect(c.timestamp).toBeLessThanOrEqual(to);
    }
  });

  it("pro-plan user (activated via the real activatePremium() flow) gets full access with a custom date range", async () => {
    const userId = ulid();
    await insertUser(env, userId, { subscription_status: "EXPIRED" });
    await activatePremium(env, userId, "user", { billingCycle: "monthly", paymentMethod: "paynow", periodDays: 30 });
    const token = await tokenFor(userId);

    const from = nowEpoch - 76 * 86400;
    const to = nowEpoch - 74 * 86400;
    const res = await worker.fetch(
      candlesRequest(token, { symbol: SYMBOL, timeframe: "M1", from: String(from), to: String(to) }),
      env
    );
    const body = (await res.json()) as { plan: string; candles: RawCandle[] };
    expect(body.plan).toBe("premium");
    expect(body.candles.length).toBeGreaterThan(0);
  });

  it("premium request without from/to is rejected with a 400 (explicit range required)", async () => {
    const userId = ulid();
    await insertUser(env, userId, { subscription_status: "EXPIRED" });
    await activatePremium(env, userId, "user", { billingCycle: "monthly", paymentMethod: "paynow", periodDays: 30 });
    const token = await tokenFor(userId);

    const res = await worker.fetch(candlesRequest(token, { symbol: SYMBOL, timeframe: "M1" }), env);
    expect(res.status).toBe(400);
  });

  it("a user whose premium period has ended is auto-downgraded and restricted like a free user", async () => {
    const userId = ulid();
    await insertUser(env, userId, { subscription_status: "EXPIRED" });
    await activatePremium(env, userId, "user", { billingCycle: "monthly", paymentMethod: "paynow", periodDays: 30 });
    // Simulate the period ending.
    await env.DB.prepare(`UPDATE users SET subscription_end_date = ? WHERE id = ?`)
      .bind(new Date(Date.now() - 1000).toISOString(), userId)
      .run();
    const token = await tokenFor(userId);

    const res = await worker.fetch(
      candlesRequest(token, { symbol: SYMBOL, timeframe: "M1", from: "0", to: String(nowEpoch) }),
      env
    );
    const body = (await res.json()) as { plan: string; restricted: boolean; count: number };
    expect(body.plan).toBe("free");
    expect(body.restricted).toBe(true);
    expect(body.count).toBeLessThanOrEqual(1000);
  });

  it("admin role gets full access regardless of subscription state", async () => {
    const userId = ulid();
    await insertUser(env, userId, { subscription_status: "CANCELLED" });
    const token = await tokenFor(userId, "admin");

    const from = nowEpoch - 76 * 86400;
    const to = nowEpoch - 74 * 86400;
    const res = await worker.fetch(
      candlesRequest(token, { symbol: SYMBOL, timeframe: "M1", from: String(from), to: String(to) }),
      env
    );
    const body = (await res.json()) as { plan: string };
    expect(body.plan).toBe("premium");
  });

  it("rejects an invalid symbol even when authenticated as premium", async () => {
    const userId = ulid();
    await insertUser(env, userId, { subscription_status: "EXPIRED" });
    await activatePremium(env, userId, "user", { billingCycle: "monthly", paymentMethod: "paynow", periodDays: 30 });
    const token = await tokenFor(userId);

    const res = await worker.fetch(
      candlesRequest(token, { symbol: "Not A Real Symbol", timeframe: "M1", from: "0", to: String(nowEpoch) }),
      env
    );
    expect(res.status).toBe(400);
  });
});
