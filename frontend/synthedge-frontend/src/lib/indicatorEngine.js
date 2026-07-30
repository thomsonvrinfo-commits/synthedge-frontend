/**
 * SynthEdge Indicator Engine
 * Pure math — no rendering, no React. All series computed over the full candles array.
 * Slicing to visible range is done in the renderer.
 */

export const INDICATOR_CATALOG = {
  ema20:  { id: "ema20",  type: "ema",    label: "EMA 20",          category: "Trend",    period: 20,  color: "hsl(45, 93%, 58%)" },
  ema50:  { id: "ema50",  type: "ema",    label: "EMA 50",          category: "Trend",    period: 50,  color: "hsl(190, 90%, 55%)" },
  ema200: { id: "ema200", type: "ema",    label: "EMA 200",         category: "Trend",    period: 200, color: "hsl(330, 85%, 65%)" },
  sma20:  { id: "sma20",  type: "sma",    label: "SMA 20",          category: "Trend",    period: 20,  color: "hsl(265, 80%, 72%)" },
  bb20:   { id: "bb20",   type: "bb",     label: "Bollinger Bands", category: "Trend",    period: 20,  stdDev: 2, color: "hsl(160, 70%, 50%)" },
  rsi14:  { id: "rsi14",  type: "rsi",    label: "RSI 14",          category: "Momentum", period: 14,  panel: "rsi",    color: "hsl(45, 93%, 58%)" },
  macd:   { id: "macd",   type: "macd",   label: "MACD",            category: "Momentum", fast: 12, slow: 26, signal: 9, panel: "macd" },
  atr14:  { id: "atr14",  type: "atr",    label: "ATR 14",          category: "Volatility", period: 14, panel: "atr", color: "hsl(190, 90%, 55%)" },
  volume: { id: "volume", type: "volume", label: "Volume",          category: "Volume",   panel: "volume" },
};

export const DEFAULT_INDICATORS = ["ema20", "ema50", "ema200", "volume"];

/**
 * Build all indicator series for the full candle array.
 * Returns { overlays: [...], panels: { volume, rsi, macd, atr } }
 */
export function buildIndicatorSeries(candles, activeIds) {
  if (!candles?.length || !activeIds?.length) return { overlays: [], panels: {} };

  const active = activeIds.map(id => INDICATOR_CATALOG[id]).filter(Boolean);
  const closes = candles.map(c => c.close);

  const overlays = [];
  const panels = {};

  for (const cfg of active) {
    if (cfg.type === "ema") {
      overlays.push({ ...cfg, values: _ema(closes, cfg.period) });
    } else if (cfg.type === "sma") {
      overlays.push({ ...cfg, values: _sma(closes, cfg.period) });
    } else if (cfg.type === "bb") {
      overlays.push({ ...cfg, values: _bollinger(closes, cfg.period, cfg.stdDev) });
    } else if (cfg.type === "rsi") {
      panels.rsi = { ...cfg, values: _rsi(closes, cfg.period) };
    } else if (cfg.type === "macd") {
      panels.macd = { ...cfg, values: _macd(closes, cfg.fast, cfg.slow, cfg.signal) };
    } else if (cfg.type === "atr") {
      panels.atr = { ...cfg, values: _atr(candles, cfg.period) };
    } else if (cfg.type === "volume") {
      panels.volume = { ...cfg, values: _volume(candles) };
    }
  }

  return { overlays, panels };
}

/** Returns the ordered panel keys that are active. */
export function activePanelKeys(activeIds) {
  return ["volume", "rsi", "macd", "atr"].filter(panel =>
    activeIds.some(id => INDICATOR_CATALOG[id]?.panel === panel)
  );
}

// ─── Math primitives ─────────────────────────────────────────────────────────

function _sma(values, period) {
  const out = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function _ema(values, period) {
  const out = Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    prev = prev == null ? v : v * k + prev * (1 - k);
    if (i >= period - 1) out[i] = prev;
  }
  return out;
}

function _bollinger(values, period, stdDev) {
  const middle = _sma(values, period);
  const upper = Array(values.length).fill(null);
  const lower = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const mid = middle[i];
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mid) ** 2;
    const dev = Math.sqrt(variance / period) * stdDev;
    upper[i] = mid + dev;
    lower[i] = mid - dev;
  }
  return { middle, upper, lower };
}

function _rsi(values, period) {
  const out = Array(values.length).fill(null);
  let gain = 0, loss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const up = Math.max(change, 0), down = Math.max(-change, 0);
    if (i <= period) {
      gain += up; loss += down;
      if (i === period) { gain /= period; loss /= period; }
    } else {
      gain = (gain * (period - 1) + up) / period;
      loss = (loss * (period - 1) + down) / period;
    }
    if (i >= period) {
      const rs = loss === 0 ? 100 : gain / loss;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

function _macd(values, fast, slow, signal) {
  const fastEma = _ema(values, fast);
  const slowEma = _ema(values, slow);
  const line = values.map((_, i) =>
    fastEma[i] == null || slowEma[i] == null ? null : fastEma[i] - slowEma[i]
  );
  const signalLine = _ema(line.map(v => v ?? 0), signal).map((v, i) => line[i] == null ? null : v);
  const hist = line.map((v, i) => v == null || signalLine[i] == null ? null : v - signalLine[i]);
  return { line, signal: signalLine, hist };
}

function _atr(candles, period) {
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prev = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  });
  return _ema(tr, period);
}

function _volume(candles) {
  return candles.map((c, i) => ({
    value: c.volume ?? c.tick_volume ?? Math.max(Math.abs(c.close - c.open), c.high - c.low),
    up: c.close >= c.open,
    index: i,
  }));
}