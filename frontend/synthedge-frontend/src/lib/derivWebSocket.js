/**
 * Deriv WebSocket API utility
 * Connects to Deriv WebSocket API to fetch historical candle data
 * for synthetic indices.
 *
 * Endpoint:
 * wss://api.derivws.com/trading/v1/options/ws/public
 *
 * This is Deriv's new public market-data WebSocket. It requires no
 * app_id and no auth for read-only data like ticks_history/candles —
 * confirmed directly with Deriv support. The old
 * wss://ws.derivws.com/websockets/v3?app_id=... endpoint only accepts
 * numeric app_ids issued from the legacy dashboard; app_ids issued from
 * the new developers.deriv.com portal (alphanumeric) are rejected there.
 */

const DERIV_WS_URL = `wss://api.derivws.com/trading/v1/options/ws/public`;

// Map our friendly names to Deriv API symbol codes
export const SYMBOL_MAP = {
  // ── Forex Majors ──────────────────────────────────────────────────────────
  "EUR/USD":                  "frxEURUSD",
  "GBP/USD":                  "frxGBPUSD",
  "USD/JPY":                  "frxUSDJPY",
  "USD/CHF":                  "frxUSDCHF",
  "AUD/USD":                  "frxAUDUSD",
  "NZD/USD":                  "frxNZDUSD",
  "USD/CAD":                  "frxUSDCAD",
  // ── Commodities ───────────────────────────────────────────────────────────
  "XAU/USD":                  "frxXAUUSD",
  // ── Volatility Indices ────────────────────────────────────────────────────
  "Volatility 10":            "R_10",
  "Volatility 25":            "R_25",
  "Volatility 50":            "R_50",
  "Volatility 75":            "R_75",
  "Volatility 100":           "R_100",
  // 1-second variants
  "Volatility 10 (1s)":       "1HZ10V",
  "Volatility 25 (1s)":       "1HZ25V",
  "Volatility 50 (1s)":       "1HZ50V",
  "Volatility 75 (1s)":       "1HZ75V",
  "Volatility 100 (1s)":      "1HZ100V",
  // Longer-period Volatility (with "Index" suffix for full canonical names)
  "Volatility 5 Index":       "R_5",
  "Volatility 15 Index":      "R_15",
  "Volatility 30 Index":      "R_30",
  "Volatility 90 Index":      "R_90",
  "Volatility 5 (1s)":        "1HZ5V",
  "Volatility 15 (1s)":       "1HZ15V",
  "Volatility 30 (1s)":       "1HZ30V",
  "Volatility 90 (1s)":       "1HZ90V",
  // Full "Index" suffix aliases for Volatility (used in symbolSpecs)
  "Volatility 10 Index":      "R_10",
  "Volatility 25 Index":      "R_25",
  "Volatility 50 Index":      "R_50",
  "Volatility 75 Index":      "R_75",
  "Volatility 100 Index":     "R_100",
  "Volatility 10 (1s) Index": "1HZ10V",
  "Volatility 25 (1s) Index": "1HZ25V",
  "Volatility 50 (1s) Index": "1HZ50V",
  "Volatility 75 (1s) Index": "1HZ75V",
  "Volatility 100 (1s) Index":"1HZ100V",
  "Volatility 150 (1s)":      "1HZ150V",
  "Volatility 250 (1s)":      "1HZ250V",
  "Volatility 150 (1s) Index":"1HZ150V",
  "Volatility 250 (1s) Index":"1HZ250V",
  // ── Jump Indices ──────────────────────────────────────────────────────────
  "Jump 10 Index":            "JD10",
  "Jump 25 Index":            "JD25",
  "Jump 50 Index":            "JD50",
  "Jump 75 Index":            "JD75",
  "Jump 100 Index":           "JD100",
  // ── Crash Indices ─────────────────────────────────────────────────────────
  "Crash 50 Index":           "CRASH50",
  "Crash 99 Index":           "CRASH99",
  "Crash 100 Index":          "CRASH100",
  "Crash 150 Index":          "CRASH150",
  "Crash 200 Index":          "CRASH200",
  "Crash 300":                "CRASH300N",
  "Crash 500":                "CRASH500",
  "Crash 600 Index":          "CRASH600",
  "Crash 900 Index":          "CRASH900",
  "Crash 1000":               "CRASH1000",
  // ── Boom Indices ──────────────────────────────────────────────────────────
  "Boom 50 Index":            "BOOM50",
  "Boom 99 Index":            "BOOM99",
  "Boom 100 Index":           "BOOM100",
  "Boom 150 Index":           "BOOM150",
  "Boom 200 Index":           "BOOM200",
  "Boom 300":                 "BOOM300N",
  "Boom 500":                 "BOOM500",
  "Boom 600 Index":           "BOOM600",
  "Boom 900 Index":           "BOOM900",
  "Boom 1000":                "BOOM1000",
  // ── Step & Range Break ────────────────────────────────────────────────────
  "Step Index":               "STPIDX",
  "Range Break 100":          "RB100N",
  "Range Break 200":          "RB200N",
};

// Available indices for the backtest UI
export const BACKTEST_INDICES = Object.keys(SYMBOL_MAP);

/**
 * Fetch historical OHLC candles from Deriv via a one-shot WebSocket request.
 *
 * @param {string} symbol   - Deriv symbol code e.g. "R_75"
 * @param {number} granularity - Candle size in seconds (60 = 1min, 300 = 5min)
 * @param {number} count    - Number of candles to fetch (max ~5000)
 * @returns {Promise<Array<{time, open, high, low, close}>>}
 */
export function fetchDerivCandles(symbol, granularity = 60, count = 5000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(DERIV_WS_URL);
    const timeoutId = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket timeout - Deriv API did not respond in 15s"));
    }, 15000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        ticks_history: symbol,
        style: "candles",
        granularity,
        count,
        end: "latest",
        adjust_start_time: 1,
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.error) {
        clearTimeout(timeoutId);
        ws.close();
        reject(new Error(msg.error.message || "Deriv API error"));
        return;
      }

      if (msg.msg_type === "candles" && msg.candles) {
        clearTimeout(timeoutId);
        ws.close();
        const candles = msg.candles.map(c => ({
          time: new Date(c.epoch * 1000).toISOString(),
          epoch: c.epoch,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
        }));
        resolve(candles);
      }
    };

    ws.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error(`WebSocket error connecting to ${DERIV_WS_URL}. Check network connectivity or Deriv service status.`));
    };

    ws.onclose = (event) => {
      if (event.code !== 1000) {
        clearTimeout(timeoutId);
        reject(new Error(`WebSocket closed unexpectedly — code ${event.code}${event.reason ? `: ${event.reason}` : ""}`));
      }
    };
  });
}

/**
 * In-memory candle cache to avoid redundant API calls during a session.
 * Key: `${symbol}_${granularity}`
 * Value: { candles: [], fetchedAt: timestamp }
 */
const candleCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getCandlesWithCache(symbol, granularity = 60, count = 5000) {
  const key = `${symbol}_${granularity}_${count}`;
  const cached = candleCache.get(key);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.candles;
  }

  const candles = await fetchDerivCandles(symbol, granularity, count);
  candleCache.set(key, { candles, fetchedAt: Date.now() });
  return candles;
}

export function clearCandleCache(symbol, granularity) {
  if (symbol) {
    candleCache.delete(`${symbol}_${granularity || 60}`);
  } else {
    candleCache.clear();
  }
}