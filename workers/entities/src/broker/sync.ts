// Broker trade sync — orchestration + field mapping.
//
// Ported from base44/functions/derivSync/entry.ts and mt5Sync/entry.ts.
// The mapping functions (mapDerivTransactionsToTrades /
// mapMt5DealsToTrades) are pure — no network, no D1 — specifically so they
// can be unit-tested against realistic fixture payloads without needing a
// live Deriv/MetaAPI connection (which this sandbox can't reach anyway).

import type { Env } from "@synthedge/shared";
import { d1All, d1Run, nowIso, ulid } from "@synthedge/shared";
import { decryptToken } from "./crypto";
import type { DerivClient, DerivTransaction } from "./derivClient";
import type { MetaApiClient, MetaApiDeal } from "./metaApiClient";

export interface BrokerConnectionRow {
  id: string;
  created_by_id: string;
  broker: "deriv" | "mt5_exness";
  account_id: string;
  account_type: "live" | "demo";
  status: "connected" | "error" | "disconnected";
  last_synced_at: string | null;
  encrypted_token: string | null;
  metaapi_account_id: string | null;
  server: string | null;
}

export interface BrokerTradeInsert {
  created_by_id: string;
  broker: "deriv" | "mt5_exness";
  account_id: string;
  account_type: "live" | "demo";
  broker_trade_id: string;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  entry_price: number;
  exit_price: number;
  opened_at: string | null;
  closed_at: string | null;
  currency: string;
  pnl: number;
  fees: number;
  swap: number;
  duration_seconds: number | null;
  result: "win" | "loss" | "breakeven";
  raw_payload: string;
}

export interface SyncResult {
  connectionId: string;
  broker: "deriv" | "mt5_exness";
  synced: number;
  error?: string;
}

function resultFor(pnl: number): "win" | "loss" | "breakeven" {
  return pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven";
}

// -- Deriv mapping -----------------------------------------------------------

export function mapDerivTransactionsToTrades(
  txns: DerivTransaction[],
  conn: Pick<BrokerConnectionRow, "created_by_id" | "account_id" | "account_type">
): BrokerTradeInsert[] {
  return txns.map((t) => {
    const brokerTradeId = String(t.contract_id ?? t.transaction_id);
    const openedAt = t.purchase_time ? new Date(t.purchase_time * 1000).toISOString() : null;
    const closedAt = t.sell_time ? new Date(t.sell_time * 1000).toISOString() : null;
    const pnl = Number(t.profit ?? 0);
    const duration = t.purchase_time && t.sell_time ? t.sell_time - t.purchase_time : null;

    return {
      created_by_id: conn.created_by_id,
      broker: "deriv",
      account_id: conn.account_id,
      account_type: conn.account_type,
      broker_trade_id: brokerTradeId,
      symbol: t.underlying || t.shortcode || "UNKNOWN",
      side: t.contract_type === "PUT" ? "sell" : "buy",
      volume: 1,
      entry_price: Number(t.entry_spot ?? t.purchase ?? 0),
      exit_price: Number(t.exit_tick ?? t.sell_price ?? 0),
      opened_at: openedAt,
      closed_at: closedAt,
      currency: t.currency || "USD",
      pnl,
      fees: 0,
      swap: 0,
      duration_seconds: duration,
      result: resultFor(pnl),
      raw_payload: JSON.stringify(t),
    };
  });
}

// -- MT5 mapping ---------------------------------------------------------------

export function mapMt5DealsToTrades(
  deals: MetaApiDeal[],
  conn: Pick<BrokerConnectionRow, "created_by_id" | "account_id" | "account_type">
): BrokerTradeInsert[] {
  const byPosition = new Map<string, MetaApiDeal[]>();
  for (const d of deals) {
    const pid = d.positionId || d.id;
    if (!pid) continue;
    const group = byPosition.get(pid) ?? [];
    group.push(d);
    byPosition.set(pid, group);
  }

  const trades: BrokerTradeInsert[] = [];
  for (const [positionId, ds] of byPosition) {
    const inDeal = ds.find((x) => x.entryType === "DEAL_ENTRY_IN" || x.entryType === "ENTRY_IN");
    const outDeal = ds.find(
      (x) => x.entryType === "DEAL_ENTRY_OUT" || x.entryType === "DEAL_ENTRY_INOUT" || x.entryType === "ENTRY_OUT"
    );
    const any = inDeal ?? outDeal ?? ds[0];
    const typeStr = (inDeal?.type ?? any?.type ?? "").toUpperCase();
    const side: "buy" | "sell" = typeStr.includes("SELL") ? "sell" : "buy";
    const openedAt = inDeal?.time ? new Date(inDeal.time).toISOString() : any?.time ? new Date(any.time).toISOString() : null;
    const closedAt = outDeal?.time ? new Date(outDeal.time).toISOString() : null;
    const pnl = Number(outDeal?.profit ?? inDeal?.profit ?? ds.reduce((s, x) => s + Number(x.profit || 0), 0));
    const fees = Number(ds.reduce((s, x) => s + Number(x.commission || 0), 0));
    const swap = Number(ds.reduce((s, x) => s + Number(x.swap || 0), 0));
    const duration =
      inDeal?.time && outDeal?.time
        ? Math.floor((new Date(outDeal.time).getTime() - new Date(inDeal.time).getTime()) / 1000)
        : null;

    trades.push({
      created_by_id: conn.created_by_id,
      broker: "mt5_exness",
      account_id: conn.account_id,
      account_type: conn.account_type,
      broker_trade_id: positionId,
      symbol: any?.symbol || "UNKNOWN",
      side,
      volume: Number(inDeal?.volume ?? any?.volume ?? 0),
      entry_price: Number(inDeal?.price ?? 0),
      exit_price: Number(outDeal?.price ?? 0),
      opened_at: openedAt,
      closed_at: closedAt,
      currency: "USD",
      pnl,
      fees,
      swap,
      duration_seconds: duration,
      result: resultFor(pnl),
      raw_payload: JSON.stringify(ds),
    });
  }
  return trades;
}

// -- Persistence ---------------------------------------------------------------

async function getExistingBrokerTradeIds(
  env: Env,
  broker: "deriv" | "mt5_exness",
  accountId: string
): Promise<Set<string>> {
  const rows = await d1All<{ broker_trade_id: string }>(
    env.DB,
    `SELECT broker_trade_id FROM broker_trades WHERE broker = ? AND account_id = ?`,
    broker,
    accountId
  );
  return new Set(rows.map((r) => r.broker_trade_id));
}

async function insertTrades(env: Env, trades: BrokerTradeInsert[]): Promise<number> {
  if (!trades.length) return 0;
  const now = nowIso();
  let inserted = 0;
  for (const t of trades) {
    // INSERT OR IGNORE as a defensive second line against the DB's own
    // UNIQUE(broker, account_id, broker_trade_id) constraint — the primary
    // dedup already happened in-memory via getExistingBrokerTradeIds, this
    // just makes concurrent syncs (e.g. cron + a manual sync overlapping)
    // safe rather than throwing.
    const result = await d1Run(
      env.DB,
      `INSERT OR IGNORE INTO broker_trades
        (id, created_by_id, broker, account_id, account_type, broker_trade_id, symbol, side, volume,
         entry_price, exit_price, opened_at, closed_at, currency, pnl, fees, swap, duration_seconds,
         result, raw_payload, created_date, updated_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ulid(),
      t.created_by_id,
      t.broker,
      t.account_id,
      t.account_type,
      t.broker_trade_id,
      t.symbol,
      t.side,
      t.volume,
      t.entry_price,
      t.exit_price,
      t.opened_at,
      t.closed_at,
      t.currency,
      t.pnl,
      t.fees,
      t.swap,
      t.duration_seconds,
      t.result,
      t.raw_payload,
      now,
      now
    );
    if (result.meta.changes > 0) inserted++;
  }
  return inserted;
}

async function markConnectionSynced(env: Env, connectionId: string): Promise<void> {
  await d1Run(
    env.DB,
    `UPDATE broker_connections SET last_synced_at = ?, status = 'connected', last_error = NULL, updated_date = ? WHERE id = ?`,
    nowIso(),
    nowIso(),
    connectionId
  );
}

async function markConnectionError(env: Env, connectionId: string, message: string): Promise<void> {
  await d1Run(
    env.DB,
    `UPDATE broker_connections SET status = 'error', last_error = ?, updated_date = ? WHERE id = ?`,
    message.slice(0, 500),
    nowIso(),
    connectionId
  );
}

export interface SyncDeps {
  derivClient: DerivClient;
  metaApiClient: MetaApiClient | null; // null if METAAPI_TOKEN isn't configured
  forceHours?: number;
}

export async function syncDerivConnection(env: Env, conn: BrokerConnectionRow, deps: SyncDeps): Promise<SyncResult> {
  try {
    if (!conn.encrypted_token) throw new Error("Connection has no stored token");
    const token = await decryptToken(env, conn.encrypted_token);
    const nowSec = Math.floor(Date.now() / 1000);
    const since = deps.forceHours
      ? nowSec - deps.forceHours * 3600
      : conn.last_synced_at
        ? Math.floor(new Date(conn.last_synced_at).getTime() / 1000)
        : nowSec - 30 * 86400;

    const txns = await deps.derivClient.fetchProfitTable(token, since, nowSec);
    const existingIds = await getExistingBrokerTradeIds(env, "deriv", conn.account_id);
    const mapped = mapDerivTransactionsToTrades(txns, conn).filter((t) => !existingIds.has(t.broker_trade_id));
    const synced = await insertTrades(env, mapped);

    await markConnectionSynced(env, conn.id);
    return { connectionId: conn.id, broker: "deriv", synced };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await markConnectionError(env, conn.id, message);
    return { connectionId: conn.id, broker: "deriv", synced: 0, error: message };
  }
}

export async function syncMt5Connection(env: Env, conn: BrokerConnectionRow, deps: SyncDeps): Promise<SyncResult> {
  try {
    if (!deps.metaApiClient) throw new Error("METAAPI_TOKEN not configured");
    if (!conn.metaapi_account_id) throw new Error("Connection has no MetaAPI account id");

    const now = new Date();
    const since = deps.forceHours
      ? new Date(now.getTime() - deps.forceHours * 3600 * 1000)
      : conn.last_synced_at
        ? new Date(conn.last_synced_at)
        : new Date(now.getTime() - 24 * 3600 * 1000);

    const deals = await deps.metaApiClient.getHistoryDeals(conn.metaapi_account_id, since, now);
    const existingIds = await getExistingBrokerTradeIds(env, "mt5_exness", conn.account_id);
    const mapped = mapMt5DealsToTrades(deals, conn).filter((t) => !existingIds.has(t.broker_trade_id));
    const synced = await insertTrades(env, mapped);

    await markConnectionSynced(env, conn.id);
    return { connectionId: conn.id, broker: "mt5_exness", synced };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await markConnectionError(env, conn.id, message);
    return { connectionId: conn.id, broker: "mt5_exness", synced: 0, error: message };
  }
}

export async function syncConnection(env: Env, conn: BrokerConnectionRow, deps: SyncDeps): Promise<SyncResult> {
  return conn.broker === "deriv" ? syncDerivConnection(env, conn, deps) : syncMt5Connection(env, conn, deps);
}

/** Syncs every 'connected' broker_connections row for one user (self-service `POST /broker/sync`). */
export async function syncUserConnections(env: Env, userId: string, deps: SyncDeps): Promise<SyncResult[]> {
  const conns = await d1All<BrokerConnectionRow>(
    env.DB,
    `SELECT * FROM broker_connections WHERE created_by_id = ? AND status IN ('connected', 'error')`,
    userId
  );
  const results: SyncResult[] = [];
  for (const conn of conns) {
    results.push(await syncConnection(env, conn, deps));
  }
  return results;
}

/** Syncs every 'connected' broker_connections row across all users (cron trigger + admin sync-all). */
export async function syncAllConnections(env: Env, deps: SyncDeps): Promise<SyncResult[]> {
  const conns = await d1All<BrokerConnectionRow>(
    env.DB,
    `SELECT * FROM broker_connections WHERE status = 'connected'`
  );
  const results: SyncResult[] = [];
  for (const conn of conns) {
    results.push(await syncConnection(env, conn, deps));
  }
  return results;
}
