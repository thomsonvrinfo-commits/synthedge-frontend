/**
 * src/api/replaySessions.ts
 *
 * Replaces `base44.entities.ReplaySession.*`. Field list mirrors
 * `base44/entities/ReplaySession.jsonc`.
 *
 * SCOPE: not wired into any page yet — Backtest.jsx (the replay/chart
 * engine's session load/autosave/save/complete flow), ReplayHub.jsx
 * (list/create/batch update/batch delete), and Journal.jsx (read-only list
 * for the Research Sessions view) all still call
 * `base44.entities.ReplaySession.*` directly, migrated in Phase 3.
 *
 * base44 call                                                → this module
 * -------------------------------------------------------------  --------------------------------
 * ReplaySession.get(id)                                          getReplaySession(id)
 * ReplaySession.list("-created_date", 10)                        listReplaySessions({ limit: 10 })
 * ReplaySession.filter({created_by_id}, "-created_date", 50)     listReplaySessions({ limit: 50 })
 * ReplaySession.filter({created_by_id, status: "completed"})     listReplaySessions({ status: "completed" })
 * ReplaySession.create(data)                                     createReplaySession(data)
 * ReplaySession.update(id, data)                                 updateReplaySession(id, data)
 * ReplaySession.delete(id)                                       deleteReplaySession(id)
 *
 * BACKEND CONTRACT ASSUMED:
 *   GET    /replay-sessions?status=&limit=&sort=  -> ReplaySession[]
 *   GET    /replay-sessions/:id                   -> ReplaySession | 404
 *   POST   /replay-sessions                       { ...fields } -> ReplaySession
 *   PATCH  /replay-sessions/:id                   { ...fields } -> ReplaySession
 *   DELETE /replay-sessions/:id                   -> {}
 */
import { apiClient, ApiError } from "@/api/client";

export interface ReplaySessionTradeSnapshot {
  direction?: string;
  entry?: number;
  sl?: number;
  tp?: number;
  state?: string;
  result?: string;
  rr?: number;
  profitLoss?: number;
  [key: string]: unknown;
}

export interface ReplaySessionStats {
  trades?: number;
  wins?: number;
  winRate?: number;
  totalPL?: number;
  [key: string]: unknown;
}

export interface ReplaySession {
  id: string;
  index_name: string;
  granularity: number;
  volume?: number;
  visible_count?: number;
  candle_start_epoch?: number;
  drawings?: unknown[];
  session_trades?: ReplaySessionTradeSnapshot[];
  stats?: ReplaySessionStats;
  name?: string;
  completed?: boolean;
  objective?: string;
  status?: "active" | "completed";
  started_at?: string;
  completed_at?: string;
  strategy_name?: string;
  rules_being_tested?: string[];
  notes?: string;
  conclusion?: string;
  created_date?: string;
  [key: string]: unknown;
}

export interface ListReplaySessionsParams {
  status?: "active" | "completed";
  limit?: number;
  sort?: string;
}

export async function listReplaySessions(params: ListReplaySessionsParams = {}): Promise<ReplaySession[]> {
  const { status, limit = 50, sort = "-created_date" } = params;
  return apiClient.get<ReplaySession[]>("/replay-sessions", { query: { status, limit, sort } });
}

export async function getReplaySession(id: string): Promise<ReplaySession | null> {
  try {
    return await apiClient.get<ReplaySession>(`/replay-sessions/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function createReplaySession(data: Partial<ReplaySession>): Promise<ReplaySession> {
  return apiClient.post<ReplaySession>("/replay-sessions", data);
}

export async function updateReplaySession(id: string, data: Partial<ReplaySession>): Promise<ReplaySession> {
  return apiClient.patch<ReplaySession>(`/replay-sessions/${id}`, data);
}

export async function deleteReplaySession(id: string): Promise<void> {
  await apiClient.delete<void>(`/replay-sessions/${id}`);
}
