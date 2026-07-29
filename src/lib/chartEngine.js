/**
 * SynthEdge Chart Engine — Coordinate transforms, layout constants, and price
 * formatting.
 *
 * The renderer (chartRenderer.js) and the object interaction service
 * (objectInteractionService.js) import these to convert between data space
 * (price, absIndex) and pixel space (x, y). Keep this module free of canvas
 * rendering — it only owns the math.
 */

// ─── Layout constants ────────────────────────────────────────────────────────
export const PADDING_L = 8;        // left edge: chart plotting starts at this x
export const HANDLE_R = 4;         // radius for drag handles on drawing objects
const DEFAULT_PAD_R = 72;          // right-side price axis width
const DEFAULT_PAD_V = 10;          // top/bottom vertical padding

// ─── Price formatting ─────────────────────────────────────────────────────────

/**
 * Decimal places to show for a given price magnitude. Synthetic indices and
 * FX pairs range from integers (Boom/Crash) down to 5-6 decimal sub-penny
 * precision, so the scale adapts rather than forcing a fixed 2dp.
 */
export function priceDecimals(price) {
  if (price == null || Number.isNaN(price)) return 2;
  const abs = Math.abs(price);
  if (abs >= 1000) return 2;
  if (abs >= 100)  return 2;
  if (abs >= 10)   return 3;
  if (abs >= 1)    return 4;
  if (abs >= 0.1)  return 5;
  if (abs >= 0.01) return 5;
  return 6;
}

/** Width of the right-side price axis in pixels. */
export function getPaddingR() {
  return DEFAULT_PAD_R;
}

// ─── Transform builder ─────────────────────────────────────────────────────────
/**
 * Builds the coordinate-space transform for a single render frame.
 *
 * Input (data space):  { price, absIndex }
 * Output (pixel space): { x, y }
 *
 * The transform is pure — it holds no canvas state and stores no pixel
 * coordinates inside drawing objects, so it survives zoom/pan/replay cleanly.
 *
 * @param {object}   opts
 * @param {Array}    opts.visibleCandles  The candles in the current slice.
 * @param {number}   opts.sliceStart     Absolute index of the first visible candle.
 * @param {number}   opts.W              Canvas width  (CSS pixels).
 * @param {number}   opts.H              Canvas height (CSS pixels).
 * @param {number}   [opts.lowerPanelHeight=0] Height reserved for indicator panels at the bottom.
 * @param {number}   [opts.vScale=1.0]   Vertical price zoom multiplier (>1 = zoom in).
 * @param {number}   [opts.futureSlots=0] Empty candle-slots of future space on the right.
 * @returns {object} transform
 */
export function buildTransform({
  visibleCandles,
  sliceStart,
  W,
  H,
  lowerPanelHeight = 0,
  vScale = 1.0,
  futureSlots = 0,
}) {
  const padR = DEFAULT_PAD_R;
  const padV = DEFAULT_PAD_V;
  const n = visibleCandles.length;

  // Vertical layout — chart sits between padV (top) and chartBottom, with
  // any indicator panels stacked below chartBottom.
  const chartBottom = H - padV - lowerPanelHeight;
  const chartH = Math.max(20, chartBottom - padV);

  // Horizontal layout — candles fill [PADDING_L, W - padR], with future space
  // counted as extra slots so panning right reveals empty chart area.
  const plotW = Math.max(10, W - PADDING_L - padR);
  const totalSlots = Math.max(1, n + futureSlots);
  const rawCandleW = plotW / totalSlots;
  const candleW = Math.max(1, rawCandleW * 0.72);

  // Price range from visible candles (highs/lows). Guard against a flat or
  // empty slice so the transform never divides by zero.
  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of visibleCandles) {
    if (!c) continue;
    if (c.low  != null && c.low  < minP) minP = c.low;
    if (c.high != null && c.high > maxP) maxP = c.high;
  }
  if (!isFinite(minP) || !isFinite(maxP)) {
    minP = 0;
    maxP = 1;
  }
  if (maxP === minP) {
    maxP = minP + Math.max(1, Math.abs(minP) * 0.001);
  }

  const rawRange = maxP - minP;
  // vScale zooms the visible price window: larger vScale = smaller yRange =
  // more zoomed-in vertically. Keep a floor so extreme zoom doesn't collapse.
  const yRange = rawRange / Math.max(0.2, vScale);
  // Pad the range slightly so candles don't kiss the chart edges, then anchor
  // maxP at the top of the window.
  const pad = yRange * 0.08;
  const adjMax = maxP + pad;
  const adjMin = adjMax - yRange;

  const priceToY = (price) => padV + ((adjMax - price) / yRange) * chartH;
  const yToPrice = (y) => adjMax - ((y - padV) / chartH) * yRange;

  const localToX = (i) => PADDING_L + i * rawCandleW;
  const absToX = (absIndex) => PADDING_L + (absIndex - sliceStart) * rawCandleW;
  const xToAbs = (x) => sliceStart + (x - PADDING_L) / rawCandleW;

  const futureAreaX = PADDING_L + n * rawCandleW;
  const lastCandleX = localToX(Math.max(0, n - 1)) + candleW;

  return {
    // Coordinate maps
    priceToY,
    yToPrice,
    absToX,
    xToAbs,
    localToX,
    // Geometry
    candleW,
    rawCandleW,
    maxP: adjMax,
    minP: adjMin,
    yRange,
    chartH,
    W,
    H,
    padR,
    padV,
    chartBottom,
    // Slice / replay
    sliceStart,
    n,
    futureAreaX,
    lastCandleX,
    futureSlots,
  };
}