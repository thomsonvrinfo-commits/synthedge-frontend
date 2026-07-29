import { useState, useCallback, useRef } from "react";
import { fetchMergedCandles } from "@/lib/historicalCandles";

// Keep each M1 fetch comfortably under the Worker's row cap while still
// covering a large amount of playback runway (≈13.9 days of M1 bars).
const TARGET_M1_ROWS = 20000;

/**
 * Loads a rolling window of real 1-minute candles that backs whichever
 * higher-timeframe candle is currently forming during replay, so
 * replayEngine.buildLiveCandleFromM1() can build the in-progress candle
 * from real sub-candle data instead of a synthesized (future-aware) path.
 *
 * No-ops when the active timeframe already IS M1 — there's nothing finer
 * to source from, and the replay engine falls back to its synthetic path
 * for that case.
 */
export function useM1ReplaySource() {
  const [m1Candles, setM1Candles] = useState([]);
  const windowRef = useRef({ from: null, to: null, index: null, granularity: null });
  const inFlightRef = useRef(false);

  /**
   * Ensures M1 coverage exists around `anchorEpoch` (the epoch of the
   * candle currently forming in replay). Cheap to call often — it only
   * fetches when the anchor has moved outside the cached window.
   */
  const ensureCoverage = useCallback(async (indexName, granularitySeconds, anchorEpoch) => {
    if (!indexName || !granularitySeconds || anchorEpoch == null) return;
    if (granularitySeconds <= 60) {
      // Base timeframe — nothing finer exists to source from.
      if (windowRef.current.granularity !== granularitySeconds) {
        windowRef.current = { from: null, to: null, index: indexName, granularity: granularitySeconds };
        setM1Candles([]);
      }
      return;
    }

    const win = windowRef.current;
    const stillCovered =
      win.index === indexName &&
      win.granularity === granularitySeconds &&
      win.from != null &&
      anchorEpoch >= win.from &&
      anchorEpoch <= win.to - granularitySeconds;

    if (stillCovered || inFlightRef.current) return;

    const windowSeconds = TARGET_M1_ROWS * 60;
    const from = anchorEpoch - granularitySeconds; // small look-behind buffer
    const to = from + windowSeconds;

    inFlightRef.current = true;
    windowRef.current = { from, to, index: indexName, granularity: granularitySeconds };
    try {
      const data = await fetchMergedCandles(indexName, 60, from, to);
      setM1Candles(data);
    } catch (err) {
      console.warn(
        "M1 replay source fetch failed — replay will fall back to approximated candle formation:",
        err
      );
      setM1Candles([]);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  return { m1Candles, ensureCoverage };
}
