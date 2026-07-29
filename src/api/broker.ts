/**
 * src/api/broker.ts
 *
 * Replaces `base44.entities.BrokerConnection.*`, `base44.entities.BrokerTrade.*`,
 * and the `connectDeriv`/`connectMt5`/`disconnectBroker` Base44 functions.
 * Field lists mirror `base44/entities/BrokerConnection.jsonc` and
 * `base44/entities/BrokerTrade.jsonc`.
 *
 * base44 call                                                        → this module
 * ---------------------------------------------------------------------  --------------------------------
 * BrokerConnection.filter({created_by_id}, "-connected_at", 50)          listConnections()
 * BrokerTrade.filter({created_by_id}, "-closed_at", N)                   listBrokerTrades({ limit: N })
 * BrokerTrade.filter({created_by_id, account_type:"live"}, "-closed_at") listBrokerTrades({ accountType: "live" })
 * BrokerTrade.update(id, { emotion_tag, note })                          updateBrokerTrade(id, { emotion_tag, note })
 * functions.invoke("connectDeriv", { api_token })                       connectDeriv(apiToken)
 * functions.invoke("connectMt5", { login, password, server })           connectMt5({ login, password, server })
 * functions.invoke("disconnectBroker", { connection_id })                disconnectBroker(connectionId)
 *
 * BACKEND CONTRACT ASSUMED:
 *   GET    /broker/connections                    -> BrokerConnection[]
 *   POST   /broker/connect/deriv    { api_token }  -> BrokerConnection
 *   POST   /broker/connect/mt5      { login, password, server } -> BrokerConnection
 *   POST   /broker/disconnect       { connection_id } -> { ok: true }
 *   GET    /broker/trades?account_type=&limit=&sort= -> BrokerTrade[]
 *   PATCH  /broker/trades/:id       { emotion_tag?, note? } -> BrokerTrade
 *
 * NOTE: the sensitive parts of connect (AES-GCM token encryption for Deriv,
 * MetaAPI provisioning for MT5, credential revocation on disconnect) are
 * server-side responsibilities today (see base44/functions/connectDeriv,
 * connectMt5, disconnectBroker) and stay that way on the new backend — this
 * module just calls the endpoints, it doesn't reimplement any of that logic.
 */
import { apiClient } from "@/api/client";

export interface BrokerConnection {
  id: string;
  broker: "deriv" | "mt5_exness";
  account_id: string;
  account_type: "live" | "demo";
  status: "connected" | "error" | "disconnected";
  last_synced_at?: string;
  connected_at?: string;
  display_name?: string;
  server?: string;
  last_error?: string;
  [key: string]: unknown;
}

export interface BrokerTrade {
  id: string;
  broker: "deriv" | "mt5_exness";
  account_id: string;
  account_type?: "live" | "demo";
  broker_trade_id: string;
  symbol: string;
  side: "buy" | "sell";
  volume?: number;
  entry_price?: number;
  exit_price?: number;
  stop_loss?: number;
  take_profit?: number;
  opened_at?: string;
  closed_at?: string;
  currency?: string;
  pnl?: number;
  fees?: number;
  swap?: number;
  duration_seconds?: number;
  r_multiple?: number;
  result: "win" | "loss" | "breakeven";
  emotion_tag?: string;
  note?: string;
  raw_payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function listConnections(): Promise<BrokerConnection[]> {
  return apiClient.get<BrokerConnection[]>("/broker/connections");
}

export async function connectDeriv(apiToken: string): Promise<BrokerConnection> {
  return apiClient.post<BrokerConnection>("/broker/connect/deriv", { api_token: apiToken });
}

export async function connectMt5(data: { login: string; password: string; server: string }): Promise<BrokerConnection> {
  return apiClient.post<BrokerConnection>("/broker/connect/mt5", data);
}

export async function disconnectBroker(connectionId: string): Promise<{ ok: true }> {
  return apiClient.post<{ ok: true }>("/broker/disconnect", { connection_id: connectionId });
}

export interface ListBrokerTradesParams {
  accountType?: "live" | "demo";
  limit?: number;
  sort?: string;
}

export async function listBrokerTrades(params: ListBrokerTradesParams = {}): Promise<BrokerTrade[]> {
  const { accountType, limit = 500, sort = "-closed_at" } = params;
  return apiClient.get<BrokerTrade[]>("/broker/trades", {
    query: { account_type: accountType, limit, sort },
  });
}

export async function updateBrokerTrade(id: string, data: { emotion_tag?: string; note?: string }): Promise<BrokerTrade> {
  return apiClient.patch<BrokerTrade>(`/broker/trades/${id}`, data);
}
