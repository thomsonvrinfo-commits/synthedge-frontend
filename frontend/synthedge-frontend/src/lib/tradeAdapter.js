/**
 * tradeAdapter.js — Central Trade Adapter (SynthEdge Launch Commander V2.0)
 * Single source of truth for all trade normalization, dataset handling,
 * analytics computation, and discipline scoring.
 */

export const DATASETS = {
  LIVE: "LIVE",
  BACKTEST: "BACKTEST",
};

export const SOURCES = {
  MANUAL: "MANUAL",
  CSV: "CSV",
  SCREENSHOT: "SCREENSHOT",
  REPLAY: "REPLAY",
  LONG_SHORT_TOOL: "LONG_SHORT_TOOL",
};

const BAD_EMOTIONS = new Set(["FOMO", "Revenge", "Anxious", "Frustrated", "Fearful", "Overconfident"]);

function numberOrUndefined(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeDataset(trade = {}) {
  if (trade.dataset === DATASETS.BACKTEST || trade.dataset === "backtest" || trade.source === "backtest") {
    return DATASETS.BACKTEST;
  }
  return DATASETS.LIVE;
}

function normalizeSource(trade = {}, dataset) {
  if (trade.source && trade.source !== "journal" && trade.source !== "backtest") {
    return String(trade.source).toUpperCase();
  }
  return dataset === DATASETS.BACKTEST ? SOURCES.REPLAY : SOURCES.MANUAL;
}

export function normalizeTrade(rawTrade = {}) {
  const dataset = normalizeDataset(rawTrade);
  const source = normalizeSource(rawTrade, dataset);

  // Canonical timestamp — prefer trade_date (user-set execution date) over
  // created_date (DB record creation timestamp, which is always "today" and MUST NOT be used for analytics).
  const createdAt =
    rawTrade.trade_date ||
    rawTrade.createdAt ||
    rawTrade.created_date ||
    new Date().toISOString();

  const updatedAt = rawTrade.updatedAt || rawTrade.updated_date || createdAt;
  const symbol = rawTrade.symbol || rawTrade.synthetic_index || rawTrade.index;
  const setup = rawTrade.setup || rawTrade.strategy;
  const rr = numberOrUndefined(rawTrade.rr ?? rawTrade.risk_reward_ratio);
  const realizedR = numberOrUndefined(rawTrade.realizedR ?? rawTrade.realized_r);
  const pl = numberOrUndefined(rawTrade.pl ?? rawTrade.profit_loss);

  // plan_followed is a string enum: "Fully" | "Partially" | "No" (or undefined)
  // Normalize legacy boolean-style values gracefully
  const rawPlan = rawTrade.plan_followed ?? rawTrade.planFollowed;
  const planFollowed = rawPlan === "Fully" || rawPlan === "Partially" || rawPlan === "No"
    ? rawPlan
    : rawPlan === true ? "Fully"
    : rawPlan === false ? "No"
    : rawTrade.rule_violations?.length ? "No" : undefined;

  const reflectionCompleted = Boolean(
    (rawTrade.reflection_completed ??
      rawTrade.reflectionCompleted ??
      rawTrade.lessons_learned) ||
      rawTrade.mistakes_made ||
      rawTrade.trade_reasoning
  );

  return {
    ...rawTrade,
    dataset,
    source,
    symbol,
    setup,
    rr,
    realizedR,
    pl,
    createdAt,
    updatedAt,
    plan_followed: planFollowed,
    reflection_completed: reflectionCompleted,
    screenshot_url:
      rawTrade.screenshot_url ||
      rawTrade.screenshot_after ||
      rawTrade.screenshot_before ||
      rawTrade.screenshot_during,
    // Legacy aliases kept for existing components while the UI migrates.
    synthetic_index: rawTrade.synthetic_index || symbol,
    strategy: rawTrade.strategy || setup,
    risk_reward_ratio: rawTrade.risk_reward_ratio ?? rr,
    profit_loss: rawTrade.profit_loss ?? pl,
    trade_date: rawTrade.trade_date || createdAt,
  };
}

export function normalizeTrades(trades = []) {
  return trades.map(normalizeTrade);
}

export function isDataset(trade, dataset) {
  return normalizeTrade(trade).dataset === dataset;
}

export function getTradeDate(trade) {
  return normalizeTrade(trade).createdAt;
}

export function getTradeValue(trade) {
  const normalized = normalizeTrade(trade);
  return normalized.pl ?? normalized.rr ?? 0;
}

export function toTradeSavePayload(trade = {}) {
  const normalized = normalizeTrade(trade);
  return {
    ...trade,
    dataset: normalized.dataset,
    source: normalized.source,
    symbol: normalized.symbol,
    setup: normalized.setup,
    rr: normalized.rr,
    realizedR: normalized.realizedR,
    realized_r: normalized.realizedR,
    pl: normalized.pl,
    createdAt: normalized.createdAt,
    updatedAt: new Date().toISOString(),
    plan_followed: normalized.plan_followed ?? undefined,
    reflection_completed: normalized.reflection_completed,
    screenshot_url: normalized.screenshot_url,
    // Backward-compatible persistence fields for existing legacy trade data.
    synthetic_index: normalized.synthetic_index,
    strategy: normalized.strategy,
    risk_reward_ratio: normalized.risk_reward_ratio,
    profit_loss: normalized.profit_loss,
    trade_date: normalized.trade_date,
  };
}

export function computeDisciplineScore(trades = []) {
  if (!trades.length) return 0;
  const normalized = normalizeTrades(trades);
  const total = normalized.length;
  const plan = normalized.filter(t => t.plan_followed === "Fully" || t.plan_followed === "Partially").length / total;
  const sl = normalized.filter(t => t.stop_loss !== undefined && t.stop_loss !== null && t.stop_loss !== "").length / total;
  const journal = normalized.filter(t => t.reflection_completed).length / total;
  const emotional = normalized.filter(t => !BAD_EMOTIONS.has(t.emotional_state)).length / total;
  return Math.round((plan * 40) + (sl * 25) + (journal * 20) + (emotional * 15));
}
