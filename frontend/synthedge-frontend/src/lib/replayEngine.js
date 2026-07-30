/**
 * Replay simulation helpers.
 * Builds a visible replay stream without exposing future candles to indicators.
 *
 * Candle formation model (MT5-style):
 *   Phase 0.00–0.15  : open tick — candle appears as a doji at open price
 *   Phase 0.15–0.50  : price moves toward close, body builds
 *   Phase 0.50–0.75  : wick extension toward the extreme in the close direction
 *   Phase 0.75–1.00  : final move to close price, opposite wick fills in
 *
 * This creates the perception that:
 *  - Wicks extend as price actually reaches those levels
 *  - The body forms gradually from the open
 *  - New candles don't appear with full wicks pre-drawn
 */

/**
 * Universal Replay Clock helpers.
 * currentReplayTime is a real market-time epoch (seconds) that stays
 * constant across timeframe switches; visibleCount/phase (candle-index
 * position within whichever candle array is currently loaded) are
 * *derived* from it, not the other way around.
 */

function findLastIndexAtOrBefore(candles, targetTime) {
  let lo = 0, hi = candles.length - 1, result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = candles[mid].epoch ?? candles[mid].timestamp;
    if (t <= targetTime) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/**
 * Derive the current market-time epoch from a candle-index position.
 */
export function replayTimeFromPosition(candles, visibleCount, phase, granularitySeconds) {
  if (!candles?.length) return null;
  const idx = Math.max(0, Math.min(visibleCount, candles.length) - 1);
  const candle = candles[idx];
  if (!candle) return null;
  const base = candle.epoch ?? candle.timestamp;
  return base + Math.max(0, Math.min(1, phase)) * granularitySeconds;
}

/**
 * Derive a candle-index position (visibleCount/phase) from a market-time
 * epoch, against whichever candle array is currently loaded. This is what
 * makes timeframe switching preserve position: load the new timeframe's
 * candles, then call this to find "the same market moment" instead of
 * resetting to index 0.
 */
export function positionFromReplayTime(candles, replayTime, granularitySeconds) {
  if (!candles?.length || replayTime == null) {
    return { visibleCount: 1, phase: 1 };
  }
  const idx = findLastIndexAtOrBefore(candles, replayTime);
  if (idx === -1) {
    return { visibleCount: 1, phase: 1 };
  }
  const candle = candles[idx];
  const base = candle.epoch ?? candle.timestamp;
  const elapsed = replayTime - base;
  const phase = Math.max(0.02, Math.min(1, elapsed / granularitySeconds));
  return { visibleCount: idx + 1, phase };
}

/**
 * opts.m1Candles          — full-resolution (1-minute) candle array covering
 *                            the currently-forming higher-timeframe candle,
 *                            if available. When present and the timeframe is
 *                            coarser than M1, the live candle is built from
 *                            REAL sub-candle data (see buildLiveCandleFromM1)
 *                            instead of a synthesized path — no foreknowledge
 *                            of the candle's eventual high/low/close is used.
 * opts.granularitySeconds — width of one higher-timeframe candle, required
 *                            to resolve which M1 candles belong to it.
 *
 * Falls back to the synthetic intrabar path (buildLiveCandle) — flagged
 * `synthetic: true` — whenever M1 backing data isn't available (e.g. the
 * timeframe already IS M1, or the M1 fetch hasn't landed yet).
 */
export function buildReplayCandles(candles, visibleCount, phase = 1, opts = {}) {
  if (!candles?.length) return [];
  const { m1Candles = null, granularitySeconds = null } = opts;
  const count = Math.max(1, Math.min(visibleCount, candles.length));
  const completeUntil = Math.max(0, count - 1);
  const out = candles.slice(0, completeUntil);
  const live = buildLiveCandleSmart(candles[count - 1], phase, m1Candles, granularitySeconds);
  if (live) out.push(live);
  return out;
}

/**
 * Builds the in-progress candle using real M1 data when possible, falling
 * back to the synthetic estimated path otherwise. Exposed separately so
 * callers that need per-candle evaluation (e.g. trade SL/TP triggering
 * during fast-forwarded replay) can use the same real-data-first logic
 * without going through the full buildReplayCandles() array builder.
 */
export function buildLiveCandleSmart(candle, phase, m1Candles, granularitySeconds) {
  if (!candle) return null;
  if (m1Candles?.length && granularitySeconds && granularitySeconds > 60) {
    const real = buildLiveCandleFromM1(candle, m1Candles, phase, granularitySeconds);
    if (real) return real;
  }
  const synthetic = buildLiveCandle(candle, phase);
  if (synthetic) synthetic.synthetic = true;
  return synthetic;
}

export function buildLiveCandle(candle, phase = 1) {
  if (!candle) return null;
  const p = Math.max(0.02, Math.min(1, phase));

  const waypoints = intrabarPath(candle); // [[price, t], ...]

  // Find which segment we're in
  let close = candle.open;
  let visitedPrices = [candle.open];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const [pA, tA] = waypoints[i];
    const [pB, tB] = waypoints[i + 1];
    if (p >= tB) {
      // This segment is fully completed — both endpoints are visited
      visitedPrices.push(pA, pB);
      continue;
    }
    if (p >= tA) {
      // We are inside this segment — interpolate current price
      const segT = (p - tA) / Math.max(0.0001, tB - tA);
      close = lerp(pA, pB, segT);
      visitedPrices.push(pA, close);
      break;
    }
  }

  // If p >= 1, close is the final waypoint price
  if (p >= 1) {
    close = waypoints[waypoints.length - 1][0];
    visitedPrices = waypoints.map(([price]) => price);
  }

  const liveHigh = Math.max(...visitedPrices);
  const liveLow  = Math.min(...visitedPrices);

  return {
    ...candle,
    close,
    high: liveHigh,
    low:  liveLow,
    isLive: p < 1,
    progress: p,
  };
}

export function nextReplayFrame({ visibleCount, phase, deltaMs, speed, total }) {
  if (total <= 0) return { visibleCount, phase, done: true };
  const stepMs = Math.max(80, speed || 400);
  let nextPhase = phase + deltaMs / stepMs;
  let nextCount = visibleCount;
  while (nextPhase >= 1 && nextCount < total) {
    nextPhase -= 1;
    nextCount += 1;
  }
  if (nextCount >= total) {
    return { visibleCount: total, phase: 1, done: true };
  }
  return { visibleCount: nextCount, phase: Math.max(0.02, nextPhase), done: false };
}

/**
 * Price discovery path for a single candle using weighted time segments.
 *
 * Instead of equal linear segments, we use explicit time breakpoints so the
 * body forms quickly (most of the phase) and wicks extend at the right moments:
 *
 * Bullish (close > open):
 *   0%→20%   open (doji — new candle just appeared)
 *   20%→55%  price dips toward low (lower wick forms first)
 *   55%→90%  rally through open toward high (body + upper wick build)
 *   90%→100% settle at close
 *
 * Bearish (close < open):
 *   0%→20%   open (doji)
 *   20%→55%  price spikes toward high (upper wick forms first)
 *   55%→90%  drop through open toward low (body + lower wick build)
 *   90%→100% settle at close
 */
function intrabarPath(candle) {
  const bullish = candle.close >= candle.open;
  // Waypoints: [price, normalizedPhase] — interpolated by lerpPath()
  if (bullish) {
    return [
      [candle.open,  0.00],
      [candle.open,  0.20],  // hold at open briefly (doji moment)
      [candle.low,   0.50],  // lower wick fully formed
      [candle.high,  0.88],  // upper wick + body formed
      [candle.close, 1.00],  // settle
    ];
  } else {
    return [
      [candle.open,  0.00],
      [candle.open,  0.20],
      [candle.high,  0.50],  // upper wick fully formed
      [candle.low,   0.88],  // lower wick + body formed
      [candle.close, 1.00],
    ];
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ─── Real (non-leaking) candle formation from M1 sub-candles ────────────────

/**
 * Builds the in-progress higher-timeframe candle purely from the M1 candles
 * that have actually "occurred" up to the current phase — no synthesized
 * path, no use of the candle's final high/low/close before it's due.
 *
 * Returns null (caller should fall back to the synthetic path) when there
 * isn't enough M1 coverage to honestly build the candle — e.g. the M1 data
 * hasn't loaded yet, or there's a gap in the historical dataset. It never
 * guesses; an honest "I don't have the real path" beats a fabricated one.
 */
export function buildLiveCandleFromM1(parentCandle, m1Candles, phase, granularitySeconds) {
  if (!parentCandle || !m1Candles?.length || !granularitySeconds) return null;
  const p = Math.max(0, Math.min(1, phase));

  const parentStart = parentCandle.epoch ?? parentCandle.timestamp;
  const parentEnd = parentStart + granularitySeconds;
  const cutoff = parentStart + p * granularitySeconds;

  const lo = lowerBoundEpoch(m1Candles, parentStart);
  const hi = lowerBoundEpoch(m1Candles, parentEnd);
  if (lo >= hi) return null; // no M1 coverage for this candle at all

  const covered = [];
  for (let i = lo; i < hi; i++) {
    const c = m1Candles[i];
    const cEpoch = c.epoch ?? c.timestamp;
    if (cEpoch < cutoff) covered.push(c);
  }

  // Sanity check: the M1 series should be dense up to `cutoff`. If it isn't
  // (a gap in the stored dataset), don't render a flat/misleading candle —
  // let the caller fall back instead.
  const expectedBars = Math.floor((cutoff - parentStart) / 60);
  if (expectedBars > 0 && covered.length < expectedBars * 0.5) return null;

  if (!covered.length) {
    return {
      ...parentCandle,
      close: parentCandle.open,
      high: parentCandle.open,
      low: parentCandle.open,
      isLive: p < 1,
      progress: p,
      synthetic: false,
    };
  }

  let high = parentCandle.open;
  let low = parentCandle.open;
  for (const c of covered) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }
  const close = covered[covered.length - 1].close;

  return {
    ...parentCandle,
    close,
    high,
    low,
    isLive: p < 1,
    progress: p,
    synthetic: false,
  };
}

function lowerBoundEpoch(arr, target) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const t = arr[mid].epoch ?? arr[mid].timestamp;
    if (t < target) lo = mid + 1; else hi = mid;
  }
  return lo;
}