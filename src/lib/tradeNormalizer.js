/**
 * tradeNormalizer.js
 * Provides a canonical view of a Trade record regardless of whether it
 * was created with the old schema (synthetic_index, profit_loss, risk_reward_ratio,
 * strategy, source="backtest") or the new schema (symbol, pl, rr, setup,
 * dataset, source="REPLAY"|"MANUAL"|...).
 *
 * All analytics, charting, and UI code should call normalizeTrade() first.
 */

/**
 * Returns a normalized trade object with canonical fields populated.
 * Original fields are preserved so nothing is lost.
 */
export function normalizeTrade(t) {
  if (!t) return t;
  return {
    ...t,
    // Symbol
    symbol: t.symbol || t.synthetic_index || "",
    // Setup
    setup: t.setup || t.strategy || "",
    // R:R
    rr: t.rr ?? t.risk_reward_ratio ?? null,
    // P/L
    pl: t.pl ?? t.profit_loss ?? null,
    // Timestamp — prefer trade_date (legacy) if canonical created_date isn't set by user
    createdAt: t.trade_date || t.created_date || null,
    // Dataset — derive from legacy source field for old records
    dataset: t.dataset || (t.source === "backtest" ? "BACKTEST" : "LIVE"),
    // Source — map legacy values to canonical
    source: _canonicalSource(t.source),
    // Reflection
    reflection_completed: t.reflection_completed ?? t.custom_fields?.reflection_completed ?? false,
    plan_followed: t.plan_followed ?? t.custom_fields?.plan_followed ?? null,
  };
}

function _canonicalSource(src) {
  if (!src || src === "journal") return "MANUAL";
  if (src === "backtest") return "REPLAY";
  return src; // already canonical: MANUAL, CSV, SCREENSHOT, REPLAY, LONG_SHORT_TOOL
}

/**
 * Normalize an array of trades.
 */
export function normalizeTrades(trades) {
  return (trades || []).map(normalizeTrade);
}

/**
 * Filter normalized trades by dataset.
 * @param {Array} trades - already normalized
 * @param {"LIVE"|"BACKTEST"} dataset
 */
export function filterByDataset(trades, dataset) {
  return trades.filter(t => t.dataset === dataset);
}

/**
 * Build the save payload for a new Quick Log trade.
 * Writes BOTH canonical and legacy fields for full backward compatibility.
 */
export function buildTradePayload({
  symbol, direction, entry_price, exit_price,
  stop_loss, take_profit, rr, pl, setup, result,
  session, trade_date, dataset, source,
  emotional_state, notes, custom_fields,
}) {
  return {
    // Canonical
    symbol,
    setup,
    rr: rr ?? undefined,
    pl: pl ?? undefined,
    dataset: dataset || "LIVE",
    source: source || "MANUAL",
    // Legacy mirrors (kept for backward compat with old analytics)
    synthetic_index: symbol,
    strategy: setup,
    risk_reward_ratio: rr ?? undefined,
    profit_loss: pl ?? undefined,
    // Shared fields
    direction,
    entry_price,
    exit_price: exit_price ?? undefined,
    stop_loss: stop_loss ?? undefined,
    take_profit: take_profit ?? undefined,
    result,
    session,
    trade_date: trade_date || new Date().toISOString(),
    emotional_state: emotional_state || undefined,
    notes: notes || undefined,
    custom_fields: custom_fields || undefined,
  };
}