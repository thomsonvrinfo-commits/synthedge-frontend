import { useState, useCallback } from "react";
import { getCandlesWithCache, clearCandleCache, SYMBOL_MAP } from "@/lib/derivWebSocket";
import { fetchMergedCandles } from "@/lib/historicalCandles";

const MAX_M1_ROWS_PER_REQUEST = 100000; // must match the Worker's MAX_M1_ROWS cap

/**
 * Hook for fetching real Deriv historical candles.
 * Handles loading state, errors, caching, and re-fetch.
 */
export function useDerivCandles() {
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null); // { index, symbol, granularity, fetchedAt }

  const fetchCandles = useCallback(async (indexName, granularity = 60, count = 100000, forceRefresh = false) => {
    const symbol = SYMBOL_MAP[indexName];
    if (!symbol) {
      setError(`Unsupported index: ${indexName}`);
      return;
    }

    setLoading(true);
    setError(null);

    if (forceRefresh) {
      clearCandleCache(symbol, granularity);
    }

    try {
      const data = await getCandlesWithCache(symbol, granularity, count);
      setCandles(data);
      setMeta({ index: indexName, symbol, granularity, fetchedAt: new Date() });
    } catch (err) {
      setError(err?.message || "Failed to load candles. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback((indexName, granularity = 60, count = 100000) => {
    fetchCandles(indexName, granularity, count, true);
  }, [fetchCandles]);

  /**
   * Fetch historical candles for an explicit epoch range, backed by the
   * D1 Worker (full historical depth) with live Deriv data automatically
   * stitched onto the end to cover any trailing gap up to 'toEpoch'.
   */
  const fetchCandlesForRange = useCallback(async (indexName, granularitySeconds, fromEpoch, toEpoch) => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchMergedCandles(indexName, granularitySeconds, fromEpoch, toEpoch);
      setCandles(data);
      setMeta({ index: indexName, granularity: granularitySeconds, fromEpoch, toEpoch, fetchedAt: new Date() });
    } catch (err) {
      setError(err?.message || "Failed to load historical candles.");
    } finally {
      setLoading(false);
    }
  }, []);

  /**
 * Fetch the most recent N candles from SynthEdge historical storage.
 * Data is served from Cloudflare Worker + D1 timeframe tables,
 * with optional live gap-fill only when needed.
 *
 * Unlike relying on Deriv's live API candle history limit,
 * SynthEdge controls its own historical dataset.
 *
 * The requested candle count is still protected by backend
 * safety limits to prevent oversized browser or database requests.
 */
  const fetchRecentCandles = useCallback(async (indexName, granularitySeconds, count = 5000) => {
    const toEpoch = Math.floor(Date.now() / 1000);

    const m1PerCandle = Math.max(1, Math.floor(granularitySeconds / 60));
    const maxCandlesForCap = Math.floor(MAX_M1_ROWS_PER_REQUEST / m1PerCandle);
    const safeCount = Math.min(count, maxCandlesForCap);

    const fromEpoch = toEpoch - safeCount * granularitySeconds;
    await fetchCandlesForRange(indexName, granularitySeconds, fromEpoch, toEpoch);
  }, [fetchCandlesForRange]);

 /**
 * Fetch candles for a user-chosen date range (Date Range picker).
 * Allows long ranges on higher timeframes.
 * Only limits M1 because it creates huge candle payloads.
 */
const fetchDateRangeCandles = useCallback(async (
  indexName,
  granularitySeconds,
  fromEpoch,
  toEpoch
) => {

  const candlesNeeded = Math.ceil(
    (toEpoch - fromEpoch) / granularitySeconds
  );

  const m1Equivalent = candlesNeeded * Math.max(
    1,
    Math.floor(granularitySeconds / 60)
  );


  // Only restrict M1 requests
  if (
    granularitySeconds === 60 &&
    m1Equivalent > MAX_M1_ROWS_PER_REQUEST
  ) {

    const maxDays = Math.floor(
      (MAX_M1_ROWS_PER_REQUEST * 60) / 86400
    );

    setError(
      `M1 replay range is too large — try under ~${maxDays} days, ` +
      `or switch to M5/H1/H4 for longer history.`
    );

    return;
  }


  await fetchCandlesForRange(
    indexName,
    granularitySeconds,
    fromEpoch,
    toEpoch
  );

}, [fetchCandlesForRange]);
  /**
 * Fetch a window of candles centered on a specific market-time epoch,
 * used when switching timeframes mid-replay so the loaded array actually
 * contains the moment the user was looking at (instead of always loading
 * "most recent", which would silently jump a historical replay to now).
 */
const fetchCandlesAroundTime = useCallback(async (
  indexName,
  granularitySeconds,
  centerEpoch,
  halfWindowCandles = 2500
) => {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const halfWindowSeconds = halfWindowCandles * granularitySeconds;

  let fromEpoch = centerEpoch - halfWindowSeconds;
  let toEpoch = Math.min(centerEpoch + halfWindowSeconds, nowEpoch);

  const m1PerCandle = Math.max(1, Math.floor(granularitySeconds / 60));
  const maxCandlesForCap = Math.floor(MAX_M1_ROWS_PER_REQUEST / m1PerCandle);
  const maxWindowSeconds = maxCandlesForCap * granularitySeconds;

  if (toEpoch - fromEpoch > maxWindowSeconds) {
    const half = Math.floor(maxWindowSeconds / 2);
    fromEpoch = centerEpoch - half;
    toEpoch = Math.min(centerEpoch + half, nowEpoch);
  }

  await fetchCandlesForRange(
    indexName,
    granularitySeconds,
    fromEpoch,
    toEpoch
  );
}, [fetchCandlesForRange]);

 return {
  candles,
  loading,
  error,
  meta,

  fetchCandles,
  refresh,

  fetchCandlesForRange,
  fetchRecentCandles,
  fetchDateRangeCandles,
  fetchCandlesAroundTime,
};
}