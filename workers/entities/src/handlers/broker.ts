// /broker — connections, trades, and sync. See src/api/broker.ts (frontend)
// for the exact contract this implements, and src/broker/* for the
// ported Deriv/MetaAPI integration this wraps.
import type { Env } from "@synthedge/shared";
import { jsonError, d1First, d1All, d1Run, nowIso, ulid } from "@synthedge/shared";
import { encryptToken } from "../broker/crypto";
import { liveDerivClient, type DerivClient } from "../broker/derivClient";
import { createMetaApiClient, type MetaApiClient } from "../broker/metaApiClient";
import { syncUserConnections, syncAllConnections, type BrokerConnectionRow, type SyncDeps } from "../broker/sync";

interface AuthedUser {
  id: string;
  role: "user" | "admin";
}

/** Test seam: production callers omit this and get the real Deriv/MetaAPI clients. */
export interface BrokerOverrides {
  derivClient?: DerivClient;
  metaApiClient?: MetaApiClient | null;
}

export function resolveSyncDeps(env: Env, overrides?: BrokerOverrides, forceHours?: number): SyncDeps {
  return {
    derivClient: overrides?.derivClient ?? liveDerivClient,
    metaApiClient:
      overrides?.metaApiClient !== undefined
        ? overrides.metaApiClient
        : env.METAAPI_TOKEN
          ? createMetaApiClient(env.METAAPI_TOKEN)
          : null,
    forceHours,
  };
}

// -- GET /broker/connections --------------------------------------------------
export async function listConnections(env: Env, user: AuthedUser): Promise<Response> {
  const rows = await d1All(
    env.DB,
    `SELECT id, broker, account_id, account_type, status, last_synced_at, connected_at, display_name, server, last_error
     FROM broker_connections WHERE created_by_id = ? ORDER BY connected_at DESC LIMIT 50`,
    user.id
  );
  return Response.json(rows);
}

// -- POST /broker/connect/deriv -----------------------------------------------
interface ConnectDerivBody {
  api_token?: string;
}

export async function connectDeriv(
  request: Request,
  env: Env,
  user: AuthedUser,
  overrides?: BrokerOverrides
): Promise<Response> {
  const body = await request.json<ConnectDerivBody>().catch(() => null);
  if (!body?.api_token) return jsonError("Missing api_token", 400);

  const derivClient = overrides?.derivClient ?? liveDerivClient;
  let authInfo;
  try {
    authInfo = await derivClient.authorize(body.api_token);
  } catch (e) {
    return jsonError(`Deriv authentication failed: ${e instanceof Error ? e.message : String(e)}`, 400);
  }

  let encrypted: string;
  try {
    encrypted = await encryptToken(env, body.api_token);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 503);
  }

  const accountType = authInfo.is_virtual ? "demo" : "live";
  const now = nowIso();

  const existing = await d1First<{ id: string }>(
    env.DB,
    `SELECT id FROM broker_connections WHERE created_by_id = ? AND broker = 'deriv' AND account_id = ?`,
    user.id,
    authInfo.loginid
  );

  if (existing) {
    await d1Run(
      env.DB,
      `UPDATE broker_connections SET status = 'connected', encrypted_token = ?, connected_at = ?, last_error = NULL, account_type = ?, updated_date = ? WHERE id = ?`,
      encrypted,
      now,
      accountType,
      now,
      existing.id
    );
    const updated = await d1First(env.DB, `SELECT * FROM broker_connections WHERE id = ?`, existing.id);
    return Response.json(updated);
  }

  const id = ulid();
  await d1Run(
    env.DB,
    `INSERT INTO broker_connections (id, created_by_id, broker, account_id, account_type, status, connected_at, display_name, encrypted_token, created_date, updated_date)
     VALUES (?, ?, 'deriv', ?, ?, 'connected', ?, ?, ?, ?, ?)`,
    id,
    user.id,
    authInfo.loginid,
    accountType,
    now,
    authInfo.loginid,
    encrypted,
    now,
    now
  );
  const created = await d1First(env.DB, `SELECT * FROM broker_connections WHERE id = ?`, id);
  return Response.json(created, { status: 201 });
}

// -- POST /broker/connect/mt5 ---------------------------------------------------
interface ConnectMt5Body {
  login?: string;
  password?: string;
  server?: string;
}

export async function connectMt5(
  request: Request,
  env: Env,
  user: AuthedUser,
  overrides?: BrokerOverrides
): Promise<Response> {
  const body = await request.json<ConnectMt5Body>().catch(() => null);
  if (!body?.login || !body.password || !body.server) {
    return jsonError("Missing login, password, or server", 400);
  }

  const metaApiClient =
    overrides?.metaApiClient !== undefined
      ? overrides.metaApiClient
      : env.METAAPI_TOKEN
        ? createMetaApiClient(env.METAAPI_TOKEN)
        : null;
  if (!metaApiClient) {
    return jsonError("METAAPI_TOKEN not set. Run: wrangler secret put METAAPI_TOKEN", 503);
  }

  let provisioned: { id: string };
  try {
    provisioned = await metaApiClient.provisionAccount({
      login: body.login,
      password: body.password,
      server: body.server,
    });
  } catch (e) {
    return jsonError(`MT5 connection failed: ${e instanceof Error ? e.message : String(e)}`, 400);
  }

  const info = await metaApiClient.getAccountInfo(provisioned.id);
  const isDemo = `${info.server ?? ""}${body.server}`.toLowerCase().includes("demo");
  const accountType = isDemo ? "demo" : "live";
  const now = nowIso();

  const existing = await d1First<{ id: string }>(
    env.DB,
    `SELECT id FROM broker_connections WHERE created_by_id = ? AND broker = 'mt5_exness' AND account_id = ?`,
    user.id,
    body.login
  );

  if (existing) {
    await d1Run(
      env.DB,
      `UPDATE broker_connections SET status = 'connected', metaapi_account_id = ?, connected_at = ?, last_error = NULL, account_type = ?, server = ?, updated_date = ? WHERE id = ?`,
      provisioned.id,
      now,
      accountType,
      body.server,
      now,
      existing.id
    );
    const updated = await d1First(env.DB, `SELECT * FROM broker_connections WHERE id = ?`, existing.id);
    return Response.json(updated);
  }

  const id = ulid();
  await d1Run(
    env.DB,
    `INSERT INTO broker_connections (id, created_by_id, broker, account_id, account_type, status, connected_at, display_name, metaapi_account_id, server, created_date, updated_date)
     VALUES (?, ?, 'mt5_exness', ?, ?, 'connected', ?, ?, ?, ?, ?, ?)`,
    id,
    user.id,
    body.login,
    accountType,
    now,
    `${body.login} (${body.server})`,
    provisioned.id,
    body.server,
    now,
    now
  );
  const created = await d1First(env.DB, `SELECT * FROM broker_connections WHERE id = ?`, id);
  return Response.json(created, { status: 201 });
}

// -- POST /broker/disconnect -----------------------------------------------------
interface DisconnectBody {
  connection_id?: string;
}

export async function disconnectBroker(
  request: Request,
  env: Env,
  user: AuthedUser,
  overrides?: BrokerOverrides
): Promise<Response> {
  const body = await request.json<DisconnectBody>().catch(() => null);
  if (!body?.connection_id) return jsonError("Missing connection_id", 400);

  const conn = await d1First<BrokerConnectionRow>(
    env.DB,
    `SELECT * FROM broker_connections WHERE id = ?`,
    body.connection_id
  );
  if (!conn) return jsonError("Not found", 404);
  if (conn.created_by_id !== user.id) return jsonError("Forbidden", 403);

  if (conn.broker === "mt5_exness" && conn.metaapi_account_id) {
    const metaApiClient =
      overrides?.metaApiClient !== undefined
        ? overrides.metaApiClient
        : env.METAAPI_TOKEN
          ? createMetaApiClient(env.METAAPI_TOKEN)
          : null;
    // Best-effort remote revocation — never blocks disconnecting locally.
    await metaApiClient?.deleteAccount(conn.metaapi_account_id).catch(() => {});
  }

  await d1Run(
    env.DB,
    `UPDATE broker_connections SET status = 'disconnected', encrypted_token = NULL, metaapi_account_id = NULL, last_error = NULL, updated_date = ? WHERE id = ?`,
    nowIso(),
    conn.id
  );
  return Response.json({ ok: true });
}

// -- GET /broker/trades ------------------------------------------------------------
const SORTABLE_FIELDS = new Set(["closed_at", "opened_at", "pnl", "created_date"]);

export async function listBrokerTrades(env: Env, user: AuthedUser, url: URL): Promise<Response> {
  const accountType = url.searchParams.get("account_type");
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 2000) : 500;

  let sortField = "closed_at";
  let sortDir = "DESC";
  const sortParam = url.searchParams.get("sort");
  if (sortParam) {
    const desc = sortParam.startsWith("-");
    const field = desc ? sortParam.slice(1) : sortParam;
    if (SORTABLE_FIELDS.has(field)) {
      sortField = field;
      sortDir = desc ? "DESC" : "ASC";
    }
  }

  const params: unknown[] = [user.id];
  let where = `created_by_id = ?`;
  if (accountType === "live" || accountType === "demo") {
    where += ` AND account_type = ?`;
    params.push(accountType);
  }
  params.push(limit);

  const rows = await d1All(
    env.DB,
    `SELECT * FROM broker_trades WHERE ${where} ORDER BY ${sortField} ${sortDir} LIMIT ?`,
    ...params
  );
  return Response.json(rows);
}

// -- PATCH /broker/trades/:id --------------------------------------------------------
interface UpdateBrokerTradeBody {
  emotion_tag?: string;
  note?: string;
}

export async function updateBrokerTrade(request: Request, env: Env, user: AuthedUser, id: string): Promise<Response> {
  const existing = await d1First<{ created_by_id: string }>(
    env.DB,
    `SELECT created_by_id FROM broker_trades WHERE id = ?`,
    id
  );
  if (!existing) return jsonError("Not found", 404);
  if (existing.created_by_id !== user.id) return jsonError("Forbidden", 403);

  const body = await request.json<UpdateBrokerTradeBody>().catch(() => null);
  if (!body) return jsonError("Invalid JSON body", 400);

  await d1Run(
    env.DB,
    `UPDATE broker_trades SET emotion_tag = COALESCE(?, emotion_tag), note = COALESCE(?, note), updated_date = ? WHERE id = ?`,
    body.emotion_tag ?? null,
    body.note ?? null,
    nowIso(),
    id
  );
  const updated = await d1First(env.DB, `SELECT * FROM broker_trades WHERE id = ?`, id);
  return Response.json(updated);
}

// -- POST /broker/sync (self-service: syncs the caller's own connections) --------------
export async function postSync(env: Env, user: AuthedUser, overrides?: BrokerOverrides): Promise<Response> {
  const results = await syncUserConnections(env, user.id, resolveSyncDeps(env, overrides));
  return Response.json({ ok: true, results });
}

// -- POST /broker/sync-all (admin-only: syncs every connected account) ----------------
export async function postSyncAll(env: Env, user: AuthedUser, overrides?: BrokerOverrides): Promise<Response> {
  if (user.role !== "admin") return jsonError("Admin role required", 403);
  const results = await syncAllConnections(env, resolveSyncDeps(env, overrides));
  const errors = results.filter((r) => r.error).length;
  return Response.json({ ok: true, processed: results.length, errors, results });
}
