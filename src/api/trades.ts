/**
 * src/api/trades.ts
 *
 * Replaces `base44.entities.Trade.*`. Field list mirrors
 * `base44/entities/Trade.jsonc` — including the legacy/canonical field pairs
 * (`symbol`/`synthetic_index`, `rr`/`risk_reward_ratio`, `pl`/`profit_loss`,
 * `setup`/`strategy`) exactly as-is; not collapsing them here since that's a
 * data-shape decision for the pages that read/write them (Phase 3), not this
 * API layer.
 *
 * SCOPE: this module is not wired into any page yet — Dashboard, Journal,
 * Assistant, ReplayHub, ReplayJournal, QuickLogForm, QuickReflection, and
 * TradeForm all still call `base44.entities.Trade.*` directly and are
 * migrated in Phase 3. Function names/signatures below are chosen to make
 * that swap mechanical:
 *
 * base44 call                                                → this module
 * ----------------------------------------------------------   -----------------------------
 * Trade.filter({created_by_id}, "-created_date", 500)          listTrades({ limit: 500 })
 * Trade.filter({created_by_id, dataset: "BACKTEST"}, ..., 500) listTrades({ dataset: "BACKTEST", limit: 500 })
 * Trade.create(payload)                                        createTrade(payload)
 * Trade.update(id, data)                                       updateTrade(id, data)
 * Trade.delete(id)                                              deleteTrade(id)
 *
 * Owner scoping (`created_by_id`) is dropped — implicit from the JWT on the
 * new backend, same convention as api/profile.ts.
 *
 * BACKEND CONTRACT ASSUMED:
 *   GET    /trades?dataset=&limit=&sort=   -> Trade[]
 *   POST   /trades                         { ...fields } -> Trade
 *   PATCH  /trades/:id                     { ...fields } -> Trade
 *   DELETE /trades/:id                     -> {}
 */
import { apiClient } from "@/api/client";

export interface Trade {
  id: string;
  symbol?: string;
  synthetic_index?: string;
  direction: "Buy" | "Sell";
  entry_price: number;
  exit_price?: number;
  stop_loss?: number;
  take_profit?: number;
  lot_size?: number;
  stake?: number;
  rr?: number;
  risk_reward_ratio?: number;
  result: "Win" | "Loss" | "Breakeven";
  pl?: number;
  profit_loss?: number;
  setup?: string;
  strategy?: string;
  emotional_state?: string;
  confidence_level?: number;
  session?: string;
  trade_date?: string;
  notes?: string;
  trade_reasoning?: string;
  market_conditions?: string;
  mistakes_made?: string;
  lessons_learned?: string;
  execution_rating?: number;
  rule_violations?: string[];
  plan_followed?: "Fully" | "Partially" | "No";
  reflection_completed?: boolean;
  dataset?: "LIVE" | "BACKTEST";
  source?: "MANUAL" | "CSV" | "SCREENSHOT" | "REPLAY" | "LONG_SHORT_TOOL" | "journal" | "backtest";
  replay_session_id?: string;
  screenshot_url?: string;
  screenshot_before?: string;
  screenshot_during?: string;
  screenshot_after?: string;
  custom_fields?: Record<string, unknown>;
  created_date?: string;
  [key: string]: unknown;
}

export interface ListTradesParams {
  /** Filter to a single dataset. Omit to get both LIVE and BACKTEST (matches current Dashboard/Journal behavior). */
  dataset?: "LIVE" | "BACKTEST";
  limit?: number;
  /** e.g. "-created_date" (default sort used everywhere today) */
  sort?: string;
}

export async function listTrades(params: ListTradesParams = {}): Promise<Trade[]> {
  const { dataset, limit = 500, sort = "-created_date" } = params;
  return apiClient.get<Trade[]>("/trades", { query: { dataset, limit, sort } });
}

export async function createTrade(data: Partial<Trade>): Promise<Trade> {
  return apiClient.post<Trade>("/trades", data);
}

export async function updateTrade(id: string, data: Partial<Trade>): Promise<Trade> {
  return apiClient.patch<Trade>(`/trades/${id}`, data);
}

export async function deleteTrade(id: string): Promise<void> {
  await apiClient.delete<void>(`/trades/${id}`);
}
