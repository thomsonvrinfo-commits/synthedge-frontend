/**
 * SynthEdge Trade State Engine
 * Manages replay trade lifecycle: waiting → active → tp_hit / sl_hit
 *
 * Completely isolated from live trading data.
 * Replay trades are NEVER written to the live Trade entity.
 */
import { calculateTradePnL } from "@/lib/symbolSpecs";

export const TRADE_STATES = {
  WAITING: "waiting",   // Placed, waiting for price to touch entry zone
  ACTIVE:  "active",    // Entry triggered — monitoring TP/SL
  TP_HIT:  "tp_hit",    // Take profit reached
  SL_HIT:  "sl_hit",    // Stop loss reached
};

/**
 * Create a new replay trade in WAITING state.
 */
export function createReplayTrade({ id, direction, entry, sl, tp, placedAtIndex, placedAtTime, symbol, volume }) {
  return {
    id: id || Date.now(),
    direction,           // "Buy" | "Sell"
    entry,
    sl,
    tp,
    symbol:     symbol || null,
    volume:     volume || null,   // lot size — null means unrecorded, excluded from P/L
    state: TRADE_STATES.WAITING,
    placedAtIndex,
    placedAtTime,
    entryTime:  null,
    entryIndex: null,
    exitTime:   null,
    exitIndex:  null,
    exitPrice:  null,
    rr:         null,
    profitLoss: null,
    plError:    null,
  };
}

/**
 * Process all pending/active replay trades against the current live candle.
 * Returns { updatedTrades, newlyCompleted[] }
 */
export function processReplayTrades(trades, liveCandle, currentAbsIndex) {
  if (!liveCandle || !trades?.length) return { updatedTrades: trades || [], newlyCompleted: [] };

  const updatedTrades = [];
  const newlyCompleted = [];

  for (const trade of trades) {
    if (trade.state === TRADE_STATES.TP_HIT || trade.state === TRADE_STATES.SL_HIT) {
      updatedTrades.push(trade);
      continue;
    }

    let updated = { ...trade };

    if (trade.state === TRADE_STATES.WAITING) {
      // Check if price touches entry zone
      const entryTouched = trade.direction === "Buy"
        ? liveCandle.low <= trade.entry && liveCandle.high >= trade.entry
        : liveCandle.high >= trade.entry && liveCandle.low <= trade.entry;

      if (entryTouched) {
        updated = {
          ...updated,
          state: TRADE_STATES.ACTIVE,
          entryTime:  liveCandle.time,
          entryIndex: currentAbsIndex,
        };
      }
    }

    if (updated.state === TRADE_STATES.ACTIVE) {
      const isBuy = updated.direction === "Buy";

      // Check TP
      const tpHit = isBuy
        ? liveCandle.high >= updated.tp
        : liveCandle.low  <= updated.tp;

      // Check SL
      const slHit = isBuy
        ? liveCandle.low  <= updated.sl
        : liveCandle.high >= updated.sl;

      if (tpHit || slHit) {
        // Both hit in same candle — SL wins (conservative)
        const result = slHit ? TRADE_STATES.SL_HIT : TRADE_STATES.TP_HIT;
        const exitPrice = slHit ? updated.sl : updated.tp;
        const risk   = Math.abs(updated.entry - updated.sl);
        const reward = Math.abs(updated.tp    - updated.entry);
        const rr     = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;

        // Use per-symbol formula; profitLoss is null if volume/symbol missing
        const { pl: profitLoss, error: plError } = calculateTradePnL(
          updated.symbol, updated.entry, exitPrice, updated.direction, updated.volume
        );

        updated = {
          ...updated,
          state:      result,
          exitPrice,
          exitTime:   liveCandle.time,
          exitIndex:  currentAbsIndex,
          rr,
          profitLoss,
          plError,
          result:     result === TRADE_STATES.TP_HIT ? "Win" : "Loss",
        };
        newlyCompleted.push(updated);
      }
    }

    updatedTrades.push(updated);
  }

  return { updatedTrades, newlyCompleted };
}

/**
 * Advance trades across an entire replay frame, not just the single
 * "live" candle snapshot at the end of it.
 *
 * Why this exists (fixes the "trade doesn't trigger on the wick" bug):
 * During active playback, one RAF tick can (a) stay within the same
 * candle at a further phase, (b) complete exactly one candle, or
 * (c) — after a slow frame, tab-backgrounding, or high playback speed —
 * complete SEVERAL candles at once. If only the final candle's live
 * snapshot were evaluated, any candle that was skipped over in-between
 * would never have its true High/Low range checked against pending
 * entries/SL/TP, and a valid trigger would be silently missed. The user
 * would then have to rewind and replay that candle — at which point it
 * is evaluated in isolation and finally triggers, which matches the
 * originally reported symptom exactly.
 *
 * This function walks every candle that closed during the frame using
 * its real, final High/Low (deterministic — never depends on replay
 * speed or animation timing), then finally evaluates the current
 * in-progress ("live") candle at its current reveal phase so a wick
 * touch is recognized the instant it is drawn.
 *
 * @param trades               current replay trades array
 * @param candles              full underlying candle array (real data)
 * @param prevVisibleCount     visibleCount before this frame
 * @param nextVisibleCount     visibleCount after this frame
 * @param nextPhase            phase (0..1) of the live candle after this frame
 * @param buildLiveCandleFn    injected to avoid a circular import with replayEngine.js
 */
export function advanceReplayTrades(trades, candles, prevVisibleCount, nextVisibleCount, nextPhase, buildLiveCandleFn) {
  if (!trades?.length || !candles?.length) {
    return { updatedTrades: trades || [], newlyCompleted: [] };
  }

  let currentTrades = trades;
  let allNewlyCompleted = [];

  // Every candle whose index is in [prevVisibleCount - 1, nextVisibleCount - 2]
  // fully closed during this frame. Evaluate each in chronological order using
  // its real, final OHLC — a trade could trigger on one skipped candle and hit
  // TP/SL on a later one within the same frame.
  const firstClosedIdx = Math.max(0, prevVisibleCount - 1);
  const lastClosedIdx = nextVisibleCount - 2;
  for (let i = firstClosedIdx; i <= lastClosedIdx; i++) {
    const closedCandle = candles[i];
    if (!closedCandle) continue;
    const { updatedTrades, newlyCompleted } = processReplayTrades(currentTrades, closedCandle, i);
    currentTrades = updatedTrades;
    if (newlyCompleted.length) allNewlyCompleted = allNewlyCompleted.concat(newlyCompleted);
  }

  // Finally, the currently-forming candle at its latest revealed phase.
  const liveIdx = nextVisibleCount - 1;
  const liveCandle = buildLiveCandleFn(candles[liveIdx], nextPhase);
  if (liveCandle) {
    const { updatedTrades, newlyCompleted } = processReplayTrades(currentTrades, liveCandle, liveIdx);
    currentTrades = updatedTrades;
    if (newlyCompleted.length) allNewlyCompleted = allNewlyCompleted.concat(newlyCompleted);
  }

  return { updatedTrades: currentTrades, newlyCompleted: allNewlyCompleted };
}

/**
 * Map trade state → display color (for canvas rendering).
 */
export function tradeStateColor(state) {
  switch (state) {
    case TRADE_STATES.WAITING: return {
      entry: "hsla(210,20%,65%,0.9)",
      tp:    "hsla(210,20%,55%,0.7)",
      sl:    "hsla(210,20%,55%,0.7)",
      fill:  "hsla(210,20%,55%,0.06)",
      label: "hsla(210,20%,80%,0.85)",
    };
    case TRADE_STATES.ACTIVE: return {
      entry: "hsla(217,91%,65%,0.95)",
      tp:    "hsla(142,71%,50%,0.85)",
      sl:    "hsla(0,72%,55%,0.85)",
      fill:  "hsla(217,91%,60%,0.06)",
      label: "hsla(217,91%,80%,0.9)",
    };
    case TRADE_STATES.TP_HIT: return {
      entry: "hsla(142,71%,45%,0.9)",
      tp:    "hsla(142,71%,55%,0.9)",
      sl:    "hsla(142,55%,40%,0.5)",
      fill:  "hsla(142,71%,45%,0.10)",
      label: "hsla(142,71%,75%,0.9)",
    };
    case TRADE_STATES.SL_HIT: return {
      entry: "hsla(0,72%,51%,0.9)",
      tp:    "hsla(0,55%,45%,0.5)",
      sl:    "hsla(0,72%,60%,0.9)",
      fill:  "hsla(0,72%,51%,0.10)",
      label: "hsla(0,72%,78%,0.9)",
    };
    default: return tradeStateColor(TRADE_STATES.WAITING);
  }
}

/**
 * Compute session stats from a list of completed replay trades.
 */
export function computeReplayStats(trades) {
  const completed = trades.filter(t =>
    t.state === TRADE_STATES.TP_HIT || t.state === TRADE_STATES.SL_HIT
  );
  const wins   = completed.filter(t => t.state === TRADE_STATES.TP_HIT).length;
  const losses = completed.filter(t => t.state === TRADE_STATES.SL_HIT).length;
  // Only sum trades that have a valid P/L (volume was captured)
  const plTrades = completed.filter(t => t.profitLoss != null);
  const totalPL = plTrades.reduce((s, t) => s + t.profitLoss, 0);
  const avgRR   = completed.length > 0
    ? completed.reduce((s, t) => s + (t.rr || 0), 0) / completed.length
    : 0;
  const missingVolume = completed.filter(t => t.plError === "volume_missing").length;

  return {
    total:    completed.length,
    pending:  trades.filter(t => t.state === TRADE_STATES.WAITING || t.state === TRADE_STATES.ACTIVE).length,
    wins,
    losses,
    winRate:  completed.length > 0 ? ((wins / completed.length) * 100).toFixed(1) : null,
    totalPL:  plTrades.length > 0 ? parseFloat(totalPL.toFixed(2)) : null,
    avgRR:    parseFloat(avgRR.toFixed(2)),
    missingVolume,
  };
}