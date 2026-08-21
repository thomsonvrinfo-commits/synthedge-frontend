/**
 * tradeNormalizer.js
 * SynthEdge — Canonical Trade Normalization Layer
 *
 * Single source of truth for converting old and new trade records
 * into the canonical format used by analytics and UI.
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

const BAD_EMOTIONS = new Set([
  "FOMO",
  "Revenge",
  "Anxious",
  "Frustrated",
  "Fearful",
  "Overconfident",
]);

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Normalize a single trade.
 */
export function normalizeTrade(t = {}) {
  if (!t) return t;

  const symbol =
    t.symbol ||
    t.synthetic_index ||
    t.index ||
    "";

  const setup =
    t.setup ||
    t.strategy ||
    "";

  const rr = numberOrNull(
    t.rr ??
    t.risk_reward_ratio
  );

  const pl = numberOrNull(
    t.pl ??
    t.profit_loss ??
    t.pnl ??
    t.profit
  );

  /*
   * IMPORTANT:
   * trade_date is the user's actual trade date.
   * created_date is the database creation timestamp.
   *
   * Analytics must use trade_date when available.
   */
  const createdAt =
    t.trade_date ||
    t.createdAt ||
    t.created_date ||
    null;

  /*
   * Dataset
   */
  const dataset =
    t.dataset === DATASETS.BACKTEST ||
    t.dataset === "backtest" ||
    t.source === "backtest"
      ? DATASETS.BACKTEST
      : DATASETS.LIVE;

  /*
   * Source
   */
  let source;

  if (!t.source || t.source === "journal") {
    source =
      dataset === DATASETS.BACKTEST
        ? SOURCES.REPLAY
        : SOURCES.MANUAL;
  } else if (t.source === "backtest") {
    source = SOURCES.REPLAY;
  } else {
    source = String(t.source).toUpperCase();
  }

  /*
   * Plan followed
   */
  const rawPlan =
    t.plan_followed ??
    t.planFollowed ??
    t.custom_fields?.plan_followed;

  const planFollowed =
    rawPlan === "Fully" ||
    rawPlan === "Partially" ||
    rawPlan === "No"
      ? rawPlan
      : rawPlan === true
        ? "Fully"
        : rawPlan === false
          ? "No"
          : t.rule_violations?.length
            ? "No"
            : null;

  /*
   * Reflection
   */
  const reflectionCompleted = Boolean(
    t.reflection_completed ??
    t.reflectionCompleted ??
    t.custom_fields?.reflection_completed ??
    t.lessons_learned ??
    t.mistakes_made ??
    t.trade_reasoning
  );

  return {
    ...t,

    // Canonical fields
    symbol,
    setup,
    rr,
    pl,
    createdAt,
    dataset,
    source,

    // Discipline fields
    plan_followed: planFollowed,
    reflection_completed: reflectionCompleted,

    // Screenshot
    screenshot_url:
      t.screenshot_url ||
      t.screenshot_after ||
      t.screenshot_before ||
      t.screenshot_during ||
      null,

    // Legacy compatibility
    synthetic_index:
      t.synthetic_index || symbol,

    strategy:
      t.strategy || setup,

    risk_reward_ratio:
      t.risk_reward_ratio ?? rr,

    profit_loss:
      t.profit_loss ??
      t.pnl ??
      t.profit ??
      pl,

    trade_date:
      t.trade_date ||
      createdAt,
  };
}

/**
 * Normalize multiple trades.
 */
export function normalizeTrades(trades = []) {
  return trades
    .filter(Boolean)
    .map(normalizeTrade);
}

/**
 * Dataset check.
 */
export function isDataset(trade, dataset) {
  return normalizeTrade(trade).dataset === dataset;
}

/**
 * Canonical trade date.
 */
export function getTradeDate(trade) {
  return normalizeTrade(trade).createdAt;
}

/**
 * Value used by analytics.
 */
export function getTradeValue(trade) {
  const normalized = normalizeTrade(trade);

  return normalized.pl ??
    normalized.rr ??
    0;
}

/**
 * Filter trades by dataset.
 */
export function filterByDataset(trades = [], dataset) {
  return normalizeTrades(trades)
    .filter(trade => trade.dataset === dataset);
}

/**
 * Build Quick Log save payload.
 *
 * Writes both canonical and legacy fields so existing
 * backend/database records remain compatible.
 */
export function buildTradePayload({
  symbol,
  direction,
  entry_price,
  exit_price,
  stop_loss,
  take_profit,
  rr,
  pl,
  setup,
  result,
  session,
  trade_date,
  dataset,
  source,
  emotional_state,
  notes,
  custom_fields,
}) {
  return {
    // Canonical
    symbol,
    setup,
    rr: rr ?? undefined,
    pl: pl ?? undefined,
    dataset: dataset || DATASETS.LIVE,
    source: source || SOURCES.MANUAL,

    // Legacy compatibility
    synthetic_index: symbol,
    strategy: setup,
    risk_reward_ratio: rr ?? undefined,
    profit_loss: pl ?? undefined,

    // Trade fields
    direction,
    entry_price,
    exit_price: exit_price ?? undefined,
    stop_loss: stop_loss ?? undefined,
    take_profit: take_profit ?? undefined,
    result,
    session,

    // IMPORTANT: actual execution date
    trade_date:
      trade_date ||
      new Date().toISOString(),

    emotional_state:
      emotional_state || undefined,

    notes:
      notes || undefined,

    custom_fields:
      custom_fields || undefined,
  };
}

/**
 * Compatibility alias.
 *
 * Some newer code may call this instead of buildTradePayload.
 */
export function toTradeSavePayload(trade = {}) {
  const normalized = normalizeTrade(trade);

  return {
    ...trade,

    dataset: normalized.dataset,
    source: normalized.source,

    symbol: normalized.symbol,
    setup: normalized.setup,

    rr: normalized.rr,
    pl: normalized.pl,

    createdAt: normalized.createdAt,
    updatedAt: new Date().toISOString(),

    plan_followed:
      normalized.plan_followed ?? undefined,

    reflection_completed:
      normalized.reflection_completed,

    screenshot_url:
      normalized.screenshot_url,

    // Legacy compatibility
    synthetic_index:
      normalized.synthetic_index,

    strategy:
      normalized.strategy,

    risk_reward_ratio:
      normalized.risk_reward_ratio,

    profit_loss:
      normalized.profit_loss ??
      normalized.pl,

    trade_date:
      normalized.trade_date,
  };
}

/**
 * Discipline score.
 *
 * 40% Plan adherence
 * 25% Stop-loss usage
 * 20% Journal/reflection
 * 15% Emotional control
 */
export function computeDisciplineScore(trades = []) {
  if (!trades.length) return 0;

  const normalized = normalizeTrades(trades);

  const total = normalized.length;

  const plan =
    normalized.filter(
      t =>
        t.plan_followed === "Fully" ||
        t.plan_followed === "Partially"
    ).length / total;

  const stopLoss =
    normalized.filter(
      t =>
        t.stop_loss !== undefined &&
        t.stop_loss !== null &&
        t.stop_loss !== ""
    ).length / total;

  const journal =
    normalized.filter(
      t => t.reflection_completed
    ).length / total;

  const emotional =
    normalized.filter(
      t => !BAD_EMOTIONS.has(t.emotional_state)
    ).length / total;

  return Math.round(
    (plan * 40) +
    (stopLoss * 25) +
    (journal * 20) +
    (emotional * 15)
  );
}
