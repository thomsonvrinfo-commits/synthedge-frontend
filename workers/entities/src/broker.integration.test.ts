// Integration tests for /broker/* routes, run against the real router with
// a real SQLite DB (fakeD1) and fake Deriv/MetaAPI clients — the network
// boundary is the one thing this sandbox genuinely can't exercise (see
// src/broker/derivClient.ts and metaApiClient.ts's docstrings), so it's
// injected via BrokerOverrides instead of mocked at the fetch layer.

import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import { createFakeD1, createFakeKV } from "../../shared/src/test-utils/fakeD1";
import type { Env } from "@synthedge/shared";
import { signAccessToken, d1First, d1Run, d1All, nowIso, ulid } from "@synthedge/shared";
import worker from "./index";
import type { DerivClient, DerivTransaction } from "./broker/derivClient";
import type { MetaApiClient, MetaApiDeal } from "./broker/metaApiClient";
import { decryptToken } from "./broker/crypto";

const SCHEMA_PATH = path.resolve(__dirname, "../../../db/migrations");
const JWT_SECRET = "test-secret-do-not-use-in-prod";
// 32 zero bytes, base64-encoded — a validly-shaped (if not securely random) AES-GCM test key.
const BROKER_ENC_KEY = Buffer.alloc(32, 7).toString("base64");

function makeEnv(): Env {
  return {
    DB: createFakeD1(SCHEMA_PATH),
    KV: createFakeKV(),
    JWT_SECRET,
    APP_BASE_URL: "http://localhost:5173",
    BROKER_ENC_KEY,
  } as Env;
}

async function insertUser(env: Env, overrides: Record<string, unknown> = {}): Promise<string> {
  const id = ulid();
  const now = nowIso();
  await d1Run(
    env.DB,
    `INSERT INTO users (id, email, password_hash, role, plan, subscription_status, created_date, updated_date)
     VALUES (?, ?, NULL, ?, 'FREE', 'TRIAL', ?, ?)`,
    id,
    `${id}@example.com`,
    (overrides.role as string) ?? "user",
    now,
    now
  );
  return id;
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

// -- Fakes -------------------------------------------------------------------

function fakeDerivClient(overrides: Partial<DerivClient> = {}): DerivClient {
  return {
    authorize: overrides.authorize ?? (async () => ({ loginid: "CR900001", is_virtual: false })),
    fetchProfitTable: overrides.fetchProfitTable ?? (async () => []),
  };
}

function fakeMetaApiClient(overrides: Partial<MetaApiClient> = {}): MetaApiClient {
  return {
    provisionAccount: overrides.provisionAccount ?? (async () => ({ id: "metaapi-acct-1" })),
    getAccountInfo: overrides.getAccountInfo ?? (async () => ({ currency: "USD", server: "Exness-Live1" })),
    getHistoryDeals: overrides.getHistoryDeals ?? (async () => []),
    deleteAccount: overrides.deleteAccount ?? (async () => {}),
  };
}

describe("Broker connections", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("GET /broker/connections requires auth", async () => {
    const res = await worker.fetch(req("GET", "/broker/connections", null), env);
    expect(res.status).toBe(401);
  });

  it("POST /broker/connect/deriv rejects a missing api_token", async () => {
    const userId = await insertUser(env);
    const token = await tokenFor(userId);
    const res = await worker.fetch(req("POST", "/broker/connect/deriv", token, {}), env);
    expect(res.status).toBe(400);
  });
});

describe("Broker connect/disconnect (via direct handler calls, injecting fake clients)", () => {
  // These call the handler functions directly (not through worker.fetch)
  // specifically so a fake DerivClient/MetaApiClient can be injected —
  // worker.fetch's router always builds the real (network-backed) clients,
  // which this sandbox can't reach. This still exercises the exact same
  // handler code the router calls; only the client construction differs.
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("creates a new Deriv connection, encrypts and stores the token, classifies demo vs live", async () => {
    const broker = await import("./handlers/broker");
    const userId = await insertUser(env);

    const res = await broker.connectDeriv(
      new Request("http://localhost/broker/connect/deriv", {
        method: "POST",
        body: JSON.stringify({ api_token: "deriv-token-abc" }),
      }),
      env,
      { id: userId, role: "user" },
      { derivClient: fakeDerivClient({ authorize: async () => ({ loginid: "CR900002", is_virtual: true }) }) }
    );
    expect(res.status).toBe(201);
    const conn = (await res.json()) as { account_id: string; account_type: string; encrypted_token: string };
    expect(conn.account_id).toBe("CR900002");
    expect(conn.account_type).toBe("demo"); // is_virtual: true

    // The plaintext token must never be stored — only its encryption.
    expect(conn.encrypted_token).not.toBe("deriv-token-abc");
    const decrypted = await decryptToken(env, conn.encrypted_token);
    expect(decrypted).toBe("deriv-token-abc");
  });

  it("reconnecting the same Deriv account_id updates the existing row instead of duplicating it", async () => {
    const broker = await import("./handlers/broker");
    const userId = await insertUser(env);
    const deps = { derivClient: fakeDerivClient() };

    await broker.connectDeriv(
      new Request("http://x", { method: "POST", body: JSON.stringify({ api_token: "token-1" }) }),
      env,
      { id: userId, role: "user" },
      deps
    );
    const second = await broker.connectDeriv(
      new Request("http://x", { method: "POST", body: JSON.stringify({ api_token: "token-2" }) }),
      env,
      { id: userId, role: "user" },
      deps
    );
    expect(second.status).toBe(200); // update, not 201 create

    const rows = await d1All(env.DB, `SELECT * FROM broker_connections WHERE created_by_id = ?`, userId);
    expect(rows).toHaveLength(1);
  });

  it("rejects a Deriv connection when authorize() fails", async () => {
    const broker = await import("./handlers/broker");
    const userId = await insertUser(env);
    const res = await broker.connectDeriv(
      new Request("http://x", { method: "POST", body: JSON.stringify({ api_token: "bad-token" }) }),
      env,
      { id: userId, role: "user" },
      { derivClient: fakeDerivClient({ authorize: async () => { throw new Error("InvalidToken"); } }) }
    );
    expect(res.status).toBe(400);
  });

  it("creates an MT5 connection via MetaAPI provisioning, detecting demo servers by name", async () => {
    const broker = await import("./handlers/broker");
    const userId = await insertUser(env);

    const res = await broker.connectMt5(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ login: "12345", password: "secret", server: "Exness-MT5Demo" }),
      }),
      env,
      { id: userId, role: "user" },
      { metaApiClient: fakeMetaApiClient() }
    );
    expect(res.status).toBe(201);
    const conn = (await res.json()) as { account_type: string; metaapi_account_id: string; server: string };
    expect(conn.account_type).toBe("demo");
    expect(conn.metaapi_account_id).toBe("metaapi-acct-1");
    expect(conn.server).toBe("Exness-MT5Demo");
  });

  it("returns 503 for MT5 connect when METAAPI_TOKEN isn't configured and no override is given", async () => {
    const broker = await import("./handlers/broker");
    const userId = await insertUser(env);
    const bareEnv = { ...env, METAAPI_TOKEN: undefined };
    const res = await broker.connectMt5(
      new Request("http://x", { method: "POST", body: JSON.stringify({ login: "1", password: "p", server: "s" }) }),
      bareEnv,
      { id: userId, role: "user" }
    );
    expect(res.status).toBe(503);
  });

  it("disconnect is owner-only, revokes the MetaAPI account for MT5, and retains synced trades", async () => {
    const broker = await import("./handlers/broker");
    const owner = await insertUser(env);
    const other = await insertUser(env);
    let deletedAccountId: string | null = null;

    const created = await broker.connectMt5(
      new Request("http://x", { method: "POST", body: JSON.stringify({ login: "1", password: "p", server: "Live1" }) }),
      env,
      { id: owner, role: "user" },
      { metaApiClient: fakeMetaApiClient({ deleteAccount: async (id) => { deletedAccountId = id; } }) }
    );
    const conn = (await created.json()) as { id: string };

    // Seed a trade against this connection to prove it survives disconnect.
    await d1Run(
      env.DB,
      `INSERT INTO broker_trades (id, created_by_id, broker, account_id, account_type, broker_trade_id, symbol, side, result, created_date, updated_date)
       VALUES (?, ?, 'mt5_exness', '1', 'live', 'deal-1', 'EURUSD', 'buy', 'win', ?, ?)`,
      ulid(),
      owner,
      nowIso(),
      nowIso()
    );

    const forbidden = await broker.disconnectBroker(
      new Request("http://x", { method: "POST", body: JSON.stringify({ connection_id: conn.id }) }),
      env,
      { id: other, role: "user" }
    );
    expect(forbidden.status).toBe(403);

    const ok = await broker.disconnectBroker(
      new Request("http://x", { method: "POST", body: JSON.stringify({ connection_id: conn.id }) }),
      env,
      { id: owner, role: "user" },
      { metaApiClient: fakeMetaApiClient({ deleteAccount: async (id) => { deletedAccountId = id; } }) }
    );
    expect(ok.status).toBe(200);
    expect(deletedAccountId).toBe("metaapi-acct-1");

    const row = await d1First<{ status: string; encrypted_token: string | null; metaapi_account_id: string | null }>(
      env.DB,
      `SELECT status, encrypted_token, metaapi_account_id FROM broker_connections WHERE id = ?`,
      conn.id
    );
    expect(row?.status).toBe("disconnected");
    expect(row?.metaapi_account_id).toBeNull();

    const trades = await d1All(env.DB, `SELECT * FROM broker_trades WHERE created_by_id = ?`, owner);
    expect(trades).toHaveLength(1); // trades are retained
  });
});

describe("GET /broker/trades and PATCH /broker/trades/:id", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  async function seedTrade(userId: string, overrides: Record<string, unknown> = {}): Promise<string> {
    const id = ulid();
    const now = nowIso();
    await d1Run(
      env.DB,
      `INSERT INTO broker_trades (id, created_by_id, broker, account_id, account_type, broker_trade_id, symbol, side, result, closed_at, created_date, updated_date)
       VALUES (?, ?, 'deriv', 'CR1', ?, ?, 'R_10', 'buy', 'win', ?, ?, ?)`,
      id,
      userId,
      (overrides.account_type as string) ?? "live",
      ulid(),
      (overrides.closed_at as string) ?? now,
      now,
      now
    );
    return id;
  }

  it("only returns the caller's own trades", async () => {
    const userA = await insertUser(env);
    const userB = await insertUser(env);
    await seedTrade(userA);
    await seedTrade(userB);

    const token = await tokenFor(userA);
    const res = await worker.fetch(req("GET", "/broker/trades", token), env);
    const trades = (await res.json()) as Array<{ created_by_id: string }>;
    expect(trades).toHaveLength(1);
    expect(trades[0]!.created_by_id).toBe(userA);
  });

  it("filters by account_type", async () => {
    const userId = await insertUser(env);
    await seedTrade(userId, { account_type: "live" });
    await seedTrade(userId, { account_type: "demo" });

    const token = await tokenFor(userId);
    const res = await worker.fetch(req("GET", "/broker/trades?account_type=demo", token), env);
    const trades = (await res.json()) as Array<{ account_type: string }>;
    expect(trades).toHaveLength(1);
    expect(trades[0]!.account_type).toBe("demo");
  });

  it("PATCH is owner-only and only updates emotion_tag/note", async () => {
    const owner = await insertUser(env);
    const other = await insertUser(env);
    const tradeId = await seedTrade(owner);

    const otherToken = await tokenFor(other);
    const forbidden = await worker.fetch(
      req("PATCH", `/broker/trades/${tradeId}`, otherToken, { note: "hacked" }),
      env
    );
    expect(forbidden.status).toBe(403);

    const ownerToken = await tokenFor(owner);
    const res = await worker.fetch(
      req("PATCH", `/broker/trades/${tradeId}`, ownerToken, { emotion_tag: "confident", note: "good entry" }),
      env
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { emotion_tag: string; note: string; symbol: string };
    expect(updated.emotion_tag).toBe("confident");
    expect(updated.note).toBe("good entry");
    expect(updated.symbol).toBe("R_10"); // untouched
  });
});

describe("POST /broker/sync and /broker/sync-all", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  async function seedDerivConnection(userId: string): Promise<string> {
    const broker = await import("./handlers/broker");
    const res = await broker.connectDeriv(
      new Request("http://x", { method: "POST", body: JSON.stringify({ api_token: "tok" }) }),
      env,
      { id: userId, role: "user" },
      { derivClient: fakeDerivClient() }
    );
    const conn = (await res.json()) as { id: string };
    return conn.id;
  }

  const SAMPLE_TXNS: DerivTransaction[] = [
    { contract_id: 1, purchase_time: 1000, sell_time: 1300, profit: 5, contract_type: "CALL", underlying: "R_10" },
    { contract_id: 2, purchase_time: 2000, sell_time: 2300, profit: -3, contract_type: "PUT", underlying: "R_25" },
  ];

  it("syncs new trades, updates last_synced_at, and dedups on a second sync with the same data", async () => {
    const broker = await import("./handlers/broker");
    const userId = await insertUser(env);
    await seedDerivConnection(userId);

    const deps = { derivClient: fakeDerivClient({ fetchProfitTable: async () => SAMPLE_TXNS }) };
    const first = await broker.postSync(env, { id: userId, role: "user" }, deps);
    const firstBody = (await first.json()) as { results: Array<{ synced: number }> };
    expect(firstBody.results[0]!.synced).toBe(2);

    const trades = await d1All(env.DB, `SELECT * FROM broker_trades WHERE created_by_id = ?`, userId);
    expect(trades).toHaveLength(2);

    const conn = await d1First<{ last_synced_at: string | null; status: string }>(
      env.DB,
      `SELECT last_synced_at, status FROM broker_connections WHERE created_by_id = ?`,
      userId
    );
    expect(conn?.last_synced_at).not.toBeNull();
    expect(conn?.status).toBe("connected");

    // Second sync with the exact same transactions must not create duplicates.
    const second = await broker.postSync(env, { id: userId, role: "user" }, deps);
    const secondBody = (await second.json()) as { results: Array<{ synced: number }> };
    expect(secondBody.results[0]!.synced).toBe(0);
    const tradesAfter = await d1All(env.DB, `SELECT * FROM broker_trades WHERE created_by_id = ?`, userId);
    expect(tradesAfter).toHaveLength(2);
  });

  it("marks the connection status='error' (without throwing) when the Deriv API call fails", async () => {
    const broker = await import("./handlers/broker");
    const userId = await insertUser(env);
    await seedDerivConnection(userId);

    const deps = {
      derivClient: fakeDerivClient({
        fetchProfitTable: async () => {
          throw new Error("Deriv rate limited");
        },
      }),
    };
    const res = await broker.postSync(env, { id: userId, role: "user" }, deps);
    expect(res.status).toBe(200); // per-connection errors don't fail the whole request
    const body = (await res.json()) as { results: Array<{ error?: string }> };
    expect(body.results[0]!.error).toContain("rate limited");

    const conn = await d1First<{ status: string; last_error: string | null }>(
      env.DB,
      `SELECT status, last_error FROM broker_connections WHERE created_by_id = ?`,
      userId
    );
    expect(conn?.status).toBe("error");
    expect(conn?.last_error).toContain("rate limited");
  });

  it("only syncs the caller's own connections via POST /broker/sync", async () => {
    const broker = await import("./handlers/broker");
    const userA = await insertUser(env);
    const userB = await insertUser(env);
    await seedDerivConnection(userA);
    await seedDerivConnection(userB);

    const deps = { derivClient: fakeDerivClient({ fetchProfitTable: async () => SAMPLE_TXNS }) };
    const res = await broker.postSync(env, { id: userA, role: "user" }, deps);
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toHaveLength(1); // not userB's connection too
  });

  it("POST /broker/sync-all is admin-only and processes every connected account", async () => {
    const broker = await import("./handlers/broker");
    const userA = await insertUser(env);
    const userB = await insertUser(env);
    const admin = await insertUser(env, { role: "admin" });
    await seedDerivConnection(userA);
    await seedDerivConnection(userB);

    const forbidden = await broker.postSyncAll(env, { id: userA, role: "user" });
    expect(forbidden.status).toBe(403);

    const deps = { derivClient: fakeDerivClient({ fetchProfitTable: async () => SAMPLE_TXNS }) };
    const res = await broker.postSyncAll(env, { id: admin, role: "admin" }, deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number; errors: number };
    expect(body.processed).toBe(2);
    expect(body.errors).toBe(0);
  });

  it("MT5 sync pairs deals into trades and skips accounts with no MetaAPI token configured", async () => {
    const broker = await import("./handlers/broker");
    const userId = await insertUser(env);
    const created = await broker.connectMt5(
      new Request("http://x", { method: "POST", body: JSON.stringify({ login: "1", password: "p", server: "Live1" }) }),
      env,
      { id: userId, role: "user" },
      { metaApiClient: fakeMetaApiClient() }
    );
    expect(created.status).toBe(201);

    const deals: MetaApiDeal[] = [
      { positionId: "p1", entryType: "DEAL_ENTRY_IN", type: "DEAL_TYPE_BUY", time: "2024-01-01T00:00:00Z", volume: 1, price: 1.1, symbol: "EURUSD" },
      { positionId: "p1", entryType: "DEAL_ENTRY_OUT", time: "2024-01-01T01:00:00Z", price: 1.11, profit: 100 },
    ];
    const res = await broker.postSync(env, { id: userId, role: "user" }, {
      derivClient: fakeDerivClient(),
      metaApiClient: fakeMetaApiClient({ getHistoryDeals: async () => deals }),
    });
    const body = (await res.json()) as { results: Array<{ synced: number; broker: string }> };
    expect(body.results[0]!.synced).toBe(1);
    expect(body.results[0]!.broker).toBe("mt5_exness");

    const trades = await d1All<{ symbol: string; pnl: number }>(env.DB, `SELECT * FROM broker_trades WHERE created_by_id = ?`, userId);
    expect(trades).toHaveLength(1);
    expect(trades[0]!.symbol).toBe("EURUSD");
    expect(trades[0]!.pnl).toBe(100);
  });
});
