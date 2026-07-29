/**
 * src/api/tradingRules.ts
 *
 * Replaces `base44.entities.TradingRule.*`. Field list mirrors
 * `base44/entities/TradingRule.jsonc`.
 *
 * SCOPE: not wired into any page yet — Journal.jsx (read) and Settings.jsx
 * (create/update/delete, including the "restore defaults" bulk-create loop)
 * still call `base44.entities.TradingRule.*` directly, migrated in Phase 3/4.
 *
 * base44 call                                          → this module
 * -----------------------------------------------------  ---------------------------
 * TradingRule.filter({created_by_id}, "-created_date",50) listTradingRules()
 * TradingRule.create(data)                                createTradingRule(data)
 * TradingRule.update(id, data)                            updateTradingRule(id, data)
 * TradingRule.delete(id)                                  deleteTradingRule(id)
 *
 * BACKEND CONTRACT ASSUMED:
 *   GET    /trading-rules?limit=&sort=   -> TradingRule[]
 *   POST   /trading-rules                { ...fields } -> TradingRule
 *   PATCH  /trading-rules/:id            { ...fields } -> TradingRule
 *   DELETE /trading-rules/:id            -> {}
 */
import { apiClient } from "@/api/client";

export interface TradingRule {
  id: string;
  title: string;
  description?: string;
  category?: "Risk Management" | "Entry Rules" | "Exit Rules" | "Session Rules" | "Psychology" | "Trade Management";
  is_active?: boolean;
  violation_count?: number;
  created_date?: string;
  [key: string]: unknown;
}

export interface ListTradingRulesParams {
  limit?: number;
  sort?: string;
}

export async function listTradingRules(params: ListTradingRulesParams = {}): Promise<TradingRule[]> {
  const { limit = 50, sort = "-created_date" } = params;
  return apiClient.get<TradingRule[]>("/trading-rules", { query: { limit, sort } });
}

export async function createTradingRule(data: Partial<TradingRule>): Promise<TradingRule> {
  return apiClient.post<TradingRule>("/trading-rules", data);
}

export async function updateTradingRule(id: string, data: Partial<TradingRule>): Promise<TradingRule> {
  return apiClient.patch<TradingRule>(`/trading-rules/${id}`, data);
}

export async function deleteTradingRule(id: string): Promise<void> {
  await apiClient.delete<void>(`/trading-rules/${id}`);
}
