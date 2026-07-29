/**
 * SynthEdge — Per-Symbol MT5 Specification Table
 * Source: Deriv MT5 Specification screens (live account)
 * Contract size = 1 for every symbol.
 *
 * Fields: digits, contractSize, tickSize, tickValue, minVolume, maxVolume, volumeStep
 * needsVerification: true → floating-spread symbol; tick value displayed as 0 in MT5 — use fallback and flag in UI.
 */

export const SYMBOL_SPECS = {
  // ── Volatility ──────────────────────────────────────────────────────────────
  "Volatility 5 Index":        { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.05,  maxVolume: 100,  volumeStep: 0.01  },
  "Volatility 10 Index":       { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.5,   maxVolume: 400,  volumeStep: 0.01  },
  "Volatility 10 (1s) Index":  { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.5,   maxVolume: 400,  volumeStep: 0.01  },
  "Volatility 15 Index":       { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.2,   maxVolume: 16,   volumeStep: 0.01  },
  "Volatility 15 (1s) Index":  { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.2,   maxVolume: 100,  volumeStep: 0.01  },
  "Volatility 25 Index":       { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.5,   maxVolume: 400,  volumeStep: 0.01  },
  "Volatility 25 (1s) Index":  { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.005, maxVolume: 2,    volumeStep: 0.001 },
  "Volatility 30 Index":       { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.2,   maxVolume: 6,    volumeStep: 0.01  },
  "Volatility 30 (1s) Index":  { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.2,   maxVolume: 120,  volumeStep: 0.01  },
  "Volatility 50 Index":       { digits: 4, contractSize: 1, tickSize: 0.0001,tickValue: 0.0001,minVolume: 4,     maxVolume: 3700, volumeStep: 0.01  },
  "Volatility 50 (1s) Index":  { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.005, maxVolume: 2,    volumeStep: 0.001 },
  "Volatility 75 Index":       { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.0001,minVolume: 0.01,  maxVolume: 15,   volumeStep: 0.001 },
  "Volatility 75 (1s) Index":  { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.05,  maxVolume: 80,   volumeStep: 0.001 },
  "Volatility 90 Index":       { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.1,   maxVolume: 2,    volumeStep: 0.01  },
  "Volatility 90 (1s) Index":  { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.1,   maxVolume: 20,   volumeStep: 0.01  },
  "Volatility 100 Index":      { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 1,     maxVolume: 220,  volumeStep: 0.01  },
  "Volatility 100 (1s) Index": { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 1,     maxVolume: 330,  volumeStep: 0.01  },
  "Volatility 150 (1s) Index": { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 1,     maxVolume: 50,   volumeStep: 0.001 },
  "Volatility 250 (1s) Index": { digits: 5, contractSize: 1, tickSize: 0.00001,tickValue:0.00001,minVolume:10,    maxVolume: 30,   volumeStep: 0.001 },

  // ── Jump ────────────────────────────────────────────────────────────────────
  "Jump 10 Index":             { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.01,  maxVolume: 10,   volumeStep: 0.01  },
  "Jump 25 Index":             { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.01,  maxVolume: 10,   volumeStep: 0.01  },
  "Jump 50 Index":             { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.01,  maxVolume: 10,   volumeStep: 0.01  },
  "Jump 75 Index":             { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.01,  maxVolume: 10,   volumeStep: 0.01  },
  "Jump 100 Index":            { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.01,  maxVolume: 10,   volumeStep: 0.01  },

  // ── Crash ───────────────────────────────────────────────────────────────────
  "Crash 50 Index":            { digits: 4, contractSize: 1, tickSize: 0.0001,tickValue: 0.0001,minVolume: 0.1,   maxVolume: 100,  volumeStep: 0.01  },
  "Crash 99 Index":            { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.1,   maxVolume: 80,   volumeStep: 0.01  },
  "Crash 100 Index":           { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.1,   maxVolume: 80,   volumeStep: 0.01  },
  "Crash 150 Index":           { digits: 4, contractSize: 1, tickSize: 0.0001,tickValue: 0.0001,minVolume: 0.5,   maxVolume: 700,  volumeStep: 0.01  },
  "Crash 200 Index":           { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.1,   maxVolume: 70,   volumeStep: 0.01  },
  "Crash 300 Index":           { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.5,   maxVolume: 230,  volumeStep: 0.01,  needsVerification: true },
  "Crash 500 Index":           { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.2,   maxVolume: 290,  volumeStep: 0.01,  needsVerification: true },
  "Crash 600 Index":           { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.2,   maxVolume: 55,   volumeStep: 0.01  },
  "Crash 900 Index":           { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.2,   maxVolume: 80,   volumeStep: 0.01,  needsVerification: true },
  "Crash 1000 Index":          { digits: 4, contractSize: 1, tickSize: 0.0001,tickValue: 0.0001,minVolume: 0.2,   maxVolume: 290,  volumeStep: 0.01,  needsVerification: true },

  // ── Boom ────────────────────────────────────────────────────────────────────
  "Boom 50 Index":             { digits: 4, contractSize: 1, tickSize: 0.0001,tickValue: 0.0001,minVolume: 0.1,   maxVolume: 100,  volumeStep: 0.01  },
  "Boom 99 Index":             { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.1,   maxVolume: 80,   volumeStep: 0.01  },
  "Boom 100 Index":            { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.1,   maxVolume: 80,   volumeStep: 0.01  },
  "Boom 150 Index":            { digits: 4, contractSize: 1, tickSize: 0.0001,tickValue: 0.0001,minVolume: 0.5,   maxVolume: 700,  volumeStep: 0.01  },
  "Boom 200 Index":            { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.1,   maxVolume: 70,   volumeStep: 0.01  },
  "Boom 300 Index":            { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.5,   maxVolume: 150,  volumeStep: 0.01,  needsVerification: true },
  "Boom 500 Index":            { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.2,   maxVolume: 190,  volumeStep: 0.01,  needsVerification: true },
  "Boom 600 Index":            { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.2,   maxVolume: 175,  volumeStep: 0.01  },
  "Boom 900 Index":            { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.2,   maxVolume: 135,  volumeStep: 0.01  },
  "Boom 1000 Index":           { digits: 4, contractSize: 1, tickSize: 0.0001,tickValue: 0.0001,minVolume: 0.2,   maxVolume: 80,   volumeStep: 0.01,  needsVerification: true },

  // ── Legacy short-name aliases (Trade entity uses these names) ────────────────
  "Volatility 10":             { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.5,   maxVolume: 400,  volumeStep: 0.01  },
  "Volatility 25":             { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.5,   maxVolume: 400,  volumeStep: 0.01  },
  "Volatility 50":             { digits: 4, contractSize: 1, tickSize: 0.0001,tickValue: 0.0001,minVolume: 4,     maxVolume: 3700, volumeStep: 0.01  },
  "Volatility 75":             { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.0001,minVolume: 0.01,  maxVolume: 15,   volumeStep: 0.001 },
  "Volatility 100":            { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 1,     maxVolume: 220,  volumeStep: 0.01  },
  "Volatility 10 (1s)":        { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.5,   maxVolume: 400,  volumeStep: 0.01  },
  "Volatility 25 (1s)":        { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.005, maxVolume: 2,    volumeStep: 0.001 },
  "Volatility 50 (1s)":        { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.005, maxVolume: 2,    volumeStep: 0.001 },
  "Volatility 75 (1s)":        { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.05,  maxVolume: 80,   volumeStep: 0.001 },
  "Volatility 100 (1s)":       { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 1,     maxVolume: 330,  volumeStep: 0.01  },
  "Crash 300":                 { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.5,   maxVolume: 230,  volumeStep: 0.01,  needsVerification: true },
  "Crash 500":                 { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.2,   maxVolume: 290,  volumeStep: 0.01,  needsVerification: true },
  "Crash 1000":                { digits: 4, contractSize: 1, tickSize: 0.0001,tickValue: 0.0001,minVolume: 0.2,   maxVolume: 290,  volumeStep: 0.01,  needsVerification: true },
  "Boom 300":                  { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.5,   maxVolume: 150,  volumeStep: 0.01,  needsVerification: true },
  "Boom 500":                  { digits: 3, contractSize: 1, tickSize: 0.001, tickValue: 0.001, minVolume: 0.2,   maxVolume: 190,  volumeStep: 0.01,  needsVerification: true },
  "Boom 1000":                 { digits: 4, contractSize: 1, tickSize: 0.0001,tickValue: 0.0001,minVolume: 0.2,   maxVolume: 80,   volumeStep: 0.01,  needsVerification: true },
  // Jump short-name aliases
  "Jump 10":                   { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.01,  maxVolume: 10,   volumeStep: 0.01  },
  "Jump 25":                   { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.01,  maxVolume: 10,   volumeStep: 0.01  },
  "Jump 50":                   { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.01,  maxVolume: 10,   volumeStep: 0.01  },
  "Jump 75":                   { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.01,  maxVolume: 10,   volumeStep: 0.01  },
  "Jump 100":                  { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.01,  maxVolume: 10,   volumeStep: 0.01  },
  // Volatility 150/250 (1s) short aliases
  "Volatility 150 (1s)":       { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 1,     maxVolume: 50,   volumeStep: 0.001 },
  "Volatility 250 (1s)":       { digits: 5, contractSize: 1, tickSize: 0.00001,tickValue:0.00001,minVolume:10,    maxVolume: 30,   volumeStep: 0.001 },
  "Step Index":                { digits: 2, contractSize: 1, tickSize: 0.1,   tickValue: 0.1,   minVolume: 0.1,   maxVolume: 200,  volumeStep: 0.01  },
  "Range Break 100":           { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.2,   maxVolume: 100,  volumeStep: 0.01  },
  "Range Break 200":           { digits: 2, contractSize: 1, tickSize: 0.01,  tickValue: 0.01,  minVolume: 0.2,   maxVolume: 100,  volumeStep: 0.01  },
};

/**
 * Get symbol spec. Returns null if not found (caller must handle).
 */
export function getSymbolSpec(symbol) {
  if (!symbol) return null;
  return SYMBOL_SPECS[symbol] || null;
}

/**
 * Central MT5 P/L calculation function.
 * Formula: ((Exit - Entry) / tickSize) × tickValue × volume  [BUY; inverted for SELL]
 *
 * Returns { pl: number, error: string|null }
 *   - pl is null when volume is missing (not defaulted to 1.0)
 *   - error is set when symbol is unknown or volume is missing
 */
export function calculateTradePnL(symbol, entryPrice, exitPrice, direction, volume) {
  const spec = getSymbolSpec(symbol);

  if (!spec) {
    return { pl: null, error: `Unknown symbol: "${symbol}". No spec found.` };
  }

  if (volume == null || volume === "" || isNaN(parseFloat(volume))) {
    return { pl: null, error: "volume_missing" };
  }

  const vol = parseFloat(volume);
  const entry = parseFloat(entryPrice);
  const exit = parseFloat(exitPrice);

  if (isNaN(entry) || isNaN(exit)) {
    return { pl: null, error: "Invalid entry or exit price." };
  }

  if (spec.needsVerification && spec.tickValue === 0) {
    return { pl: null, error: `Symbol "${symbol}" has an unverified tick value — P/L cannot be computed until confirmed in MT5.` };
  }

  const multiplier = spec.tickValue / spec.tickSize;
  const rawPL = direction === "Buy"
    ? (exit - entry) * multiplier * vol
    : (entry - exit) * multiplier * vol;

  return { pl: parseFloat(rawPL.toFixed(2)), error: null };
}

/**
 * Format a price to its symbol's digit precision.
 */
export function formatPrice(price, symbol) {
  const spec = getSymbolSpec(symbol);
  const digits = spec?.digits ?? 2;
  return parseFloat(price).toFixed(digits);
}

/**
 * Returns true if the trade is missing volume and should be excluded from aggregates.
 */
export function isMissingVolume(trade) {
  const vol = trade.lot_size ?? trade.volume ?? trade.stake;
  return vol == null || vol === "" || isNaN(parseFloat(vol));
}