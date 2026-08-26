/**
 * SynthEdge Chart Renderer — Multi-layer canvas rendering.
 * Each layer renders independently. No pixel coordinates stored in objects.
 *
 * Object coordinate space: { price, absIndex } — survives zoom/pan/replay.
 */

import { PADDING_L, HANDLE_R, priceDecimals } from "./chartEngine.js";
import { CHART_THEMES, getStoredTheme } from "./themeStore.js";

// Resolved at render time — caller may override via renderFrame({ theme })
function getC(theme) {
  return CHART_THEMES[theme] || CHART_THEMES.dark;
}

// Keep a fallback for callers that don't pass theme
const C = CHART_THEMES.dark;

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

// ─── Layer 1: Background + grid + axes ───────────────────────────────────────
export function renderGridLayer(ctx, transform, theme = "dark", chartSettings = {}) {
  const T = getC(theme);
  const { priceToY, maxP, yRange, chartH, W, H, lastCandleX, futureAreaX } = transform;
  const futureSlots = transform.futureSlots || 0;
  const showGrid = chartSettings.showGrid !== false;

  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);

  // Future space tint — only shown when user has panned right (futureSlots > 0)
  if (futureSlots > 0 && futureAreaX != null && futureAreaX < W - transform.padR) {
    ctx.fillStyle = theme === "light" ? "rgba(0,0,0,0.018)" : "rgba(255,255,255,0.018)";
    ctx.fillRect(futureAreaX, 0, W - transform.padR - futureAreaX, H);
    // Subtle separator line at the last candle boundary
    ctx.strokeStyle = theme === "light" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.09)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(futureAreaX, transform.padV);
    ctx.lineTo(futureAreaX, H - transform.padV);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = T.axisBg;
  ctx.fillRect(W - transform.padR, 0, transform.padR, H);

  ctx.strokeStyle = T.grid;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(W - transform.padR, transform.padV);
  ctx.lineTo(W - transform.padR, H - transform.padV);
  ctx.stroke();

  // Denser price levels — target ~12-16 levels
  const MIN_PX_PER_LEVEL = 28;
  const LEVELS = Math.min(16, Math.max(6, Math.floor(chartH / MIN_PX_PER_LEVEL)));

  for (let i = 0; i <= LEVELS; i++) {
    const y = transform.padV + (i / LEVELS) * chartH;
    const price = maxP - (i / LEVELS) * yRange;
    const dec = priceDecimals(price);

    if (showGrid) {
      ctx.strokeStyle = T.grid;
      ctx.lineWidth = 0.4;
      ctx.setLineDash([2, 6]);
      ctx.beginPath(); ctx.moveTo(PADDING_L, y); ctx.lineTo(W - transform.padR, y); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = T.axisText;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W - transform.padR, y); ctx.lineTo(W - transform.padR + 4, y); ctx.stroke();

    ctx.fillStyle = T.axisText;
    ctx.font = "9px JetBrains Mono, monospace";
    ctx.textAlign = "left";
    ctx.fillText(price.toFixed(dec), W - transform.padR + 7, y + 3);
  }
  ctx.textAlign = "left";
}

// ─── Layer 2: Time axis ───────────────────────────────────────────────────────
export function renderTimeAxis(ctx, transform, visibleCandles, theme = "dark") {
  const T = getC(theme);
  const { localToX, candleW, chartBottom } = transform;
  const step = Math.max(1, Math.floor(visibleCandles.length / 6));
  ctx.fillStyle = T.timeText;
  ctx.font = "8px JetBrains Mono, monospace";
  for (let i = 0; i < visibleCandles.length; i += step) {
    const x = localToX(i) + candleW / 2;
    const dt = new Date(visibleCandles[i].time);
    const label = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    ctx.fillText(label, x - 14, chartBottom + 15);
  }
}

// ─── Layer 2b: Day dividers (date markers + vertical lines) ────────────────────
export function renderDayDividers(ctx, transform, visibleCandles, theme = "dark") {
  if (!visibleCandles?.length) return;
  const T = getC(theme);
  const { chartBottom, rawCandleW } = transform;

  // Detect day boundaries — first candle of each new day
  const boundaries = [];
  let lastDateStr = null;
  for (let i = 0; i < visibleCandles.length; i++) {
    if (!visibleCandles[i]?.time) continue;
    const dt = new Date(visibleCandles[i].time);
    const dateStr = dt.toLocaleDateString([], { month: "short", day: "numeric" });
    if (dateStr !== lastDateStr) {
      boundaries.push({ index: i, label: dateStr });
      lastDateStr = dateStr;
    }
  }

  if (boundaries.length === 0) return;

  ctx.save();
  ctx.textAlign = "left";

  for (const b of boundaries) {
    // x = left edge of candle slot
    const x = PADDING_L + b.index * rawCandleW;

    // Vertical divider line (subtle dashed)
    ctx.strokeStyle = theme === "light" ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.08)";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(x, transform.padV);
    ctx.lineTo(x, chartBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Date label with subtle background for readability
    ctx.font = "bold 8.5px Inter, sans-serif";
    const tw = ctx.measureText(b.label).width + 6;
    ctx.fillStyle = theme === "light" ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.92)";
    ctx.fillRect(x + 2, chartBottom + 8, tw, 11);
    ctx.fillStyle = T.timeText;
    ctx.fillText(b.label, x + 5, chartBottom + 16);
  }

  ctx.restore();
}

// ─── Layer 3: Candles ─────────────────────────────────────────────────────────
export function renderCandleLayer(ctx, transform, visibleCandles, theme = "dark", chartSettings = {}) {
  const T = getC(theme);
  const { priceToY, localToX, candleW } = transform;

  // Custom candle colors from settings
  const bullColor = chartSettings.bullBody || T.bull;
  const bearColor = chartSettings.bearBody || T.bear;
  const bullWick  = chartSettings.bullWick || T.bull;
  const bearWick  = chartSettings.bearWick || T.bear;

  // Wick thickness scales with candle width — wider chart = thicker wicks, min 1px
  const wickW = Math.min(2.5, Math.max(1.0, candleW * 0.18));

  for (let i = 0; i < visibleCandles.length; i++) {
    const c = visibleCandles[i];
    const x = localToX(i);
    const wickX = Math.round(x + candleW / 2) + 0.5; // pixel-snap for crisp lines
    const bull = c.close >= c.open;
    const isLive = !!c.isLive;

    // ── Wick ──────────────────────────────────────────────────────────────────
    // Live candle: draw upper and lower wicks separately so only the reached
    // extreme is drawn (high/low on the live candle is already capped by
    // buildLiveCandle, but we add a subtle highlight to the forming tip)
    ctx.strokeStyle = bull ? bullWick : bearWick;
    ctx.lineWidth = wickW;
    ctx.setLineDash([]);

    const highY = priceToY(c.high);
    const lowY  = priceToY(c.low);
    const openY = priceToY(c.open);

    ctx.beginPath();
    ctx.moveTo(wickX, highY);
    ctx.lineTo(wickX, lowY);
    ctx.stroke();

    // Glow on the wick tip of the live (forming) candle to signal active price
    if (isLive) {
      const tipY = bull ? highY : lowY; // current extreme tip
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(Date.now() / 220); // subtle pulse
      ctx.strokeStyle = bull ? bullWick : bearWick;
      ctx.lineWidth = wickW + 1.5;
      ctx.beginPath();
      ctx.moveTo(wickX - 0.5, tipY);
      ctx.lineTo(wickX + 0.5, tipY);
      ctx.stroke();
      ctx.restore();
    }

    // ── Body ──────────────────────────────────────────────────────────────────
    const top = priceToY(Math.max(c.open, c.close));
    const bot = priceToY(Math.min(c.open, c.close));
    const bodyH = Math.max(1.5, bot - top);

    ctx.globalAlpha = isLive ? 0.82 : 1;
    ctx.fillStyle = bull ? bullColor : bearColor;
    ctx.fillRect(x, top, candleW, bodyH);

    // Doji line — when open ≈ close, draw a horizontal line instead of invisible body
    if (bodyH <= 1.5) {
      ctx.strokeStyle = bull ? bullColor : bearColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + candleW, top);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }
}

// ─── Layer 4: Indicator overlays (EMA / SMA / BB) ────────────────────────────
export function renderIndicatorOverlayLayer(ctx, transform, indicatorSeries) {
  if (!indicatorSeries?.overlays?.length) return;
  for (const item of indicatorSeries.overlays) {
    if (item.type === "bb") {
      _bandFill(ctx, transform, item.values.upper, item.values.lower, item.color);
      _seriesLine(ctx, transform, item.values.upper, item.color, 1.1, 0.85);
      _seriesLine(ctx, transform, item.values.middle, item.color, 1, 0.65);
      _seriesLine(ctx, transform, item.values.lower, item.color, 1.1, 0.85);
    } else {
      _seriesLine(ctx, transform, item.values, item.color, item.period >= 200 ? 1.4 : 1.2, 0.95);
    }
  }
}

// ─── Layer 5: Drawing objects (price+index anchored) ─────────────────────────
export function renderDrawingsLayer(ctx, transform, objects, selectedId, editingId, hoveredId, hoverHandle) {
  for (const obj of objects) {
    renderObject(ctx, transform, obj, {
      isSelected: obj.id === selectedId,
      isEditing:  obj.id === editingId,
      isHovered:  obj.id === hoveredId,
      hoverHandle: obj.id === hoveredId ? hoverHandle : null,
    });
  }
}

export function renderObject(ctx, transform, obj, options = {}) {
  const { isSelected = false, isEditing = false, isHovered = false, hoverHandle = null } = options;
  const { priceToY, absToX, W } = transform;
  const col = obj.color || C.drawing;

  let stroke = col;
  if (isHovered)  stroke = "hsl(45, 93%, 72%)";
  if (isSelected) stroke = "hsl(217, 91%, 78%)";
  if (isEditing)  stroke = C.selected;

  ctx.strokeStyle = stroke;
  ctx.lineWidth = (isSelected || isEditing) ? 2 : 1.5;
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  switch (obj.type) {
    case "hline": {
      const y = priceToY(obj.price);
      ctx.beginPath(); ctx.moveTo(PADDING_L, y); ctx.lineTo(W - transform.padR, y); ctx.stroke();
      ctx.fillStyle = stroke;
      ctx.font = "9px JetBrains Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText(obj.price.toFixed(priceDecimals(obj.price)), W - transform.padR - 6, y - 3);
      ctx.textAlign = "left";
      if (isEditing) _handle(ctx, (PADDING_L + W - transform.padR) / 2, y, hoverHandle === "line");
      if (isSelected && !isEditing) _selectionGlow(ctx, (PADDING_L + W - transform.padR) / 2, y);
      break;
    }
    case "ray": {
      if (obj.price == null || obj.absIndex == null) break;
      const anchorX = absToX(obj.absIndex);
      const y = priceToY(obj.price);
      const leftEdge = PADDING_L, rightEdge = W - transform.padR;
      // Extends right from the anchor by default (per spec); extendLeft/
      // extendRight are opt-in toggles for a future object-properties panel.
      const startX = obj.extendLeft ? leftEdge : anchorX;
      const endX = obj.extendRight !== false ? rightEdge : anchorX;

      const dashPatterns = { solid: [], dashed: [6, 4], dotted: [1.5, 3] };
      ctx.setLineDash(dashPatterns[obj.lineStyle] || []);
      ctx.lineWidth = (obj.thickness || 1.5) + (isSelected || isEditing ? 0.5 : 0);
      ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
      ctx.setLineDash([]);

      if (obj.showPriceLabel !== false) {
        ctx.fillStyle = stroke;
        ctx.font = "9px JetBrains Mono, monospace";
        ctx.textAlign = "right";
        ctx.fillText(obj.price.toFixed(priceDecimals(obj.price)), rightEdge - 6, y - 3);
        ctx.textAlign = "left";
      }
      if (obj.label) {
        ctx.fillStyle = stroke;
        ctx.font = "bold 10px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(obj.label, anchorX + 6, y - 5);
      }

      // Small dot at the anchor so the ray's origin (its drag handle) reads
      // clearly, distinct from a plain hline which has no single anchor.
      ctx.fillStyle = stroke;
      ctx.beginPath(); ctx.arc(anchorX, y, 2.5, 0, Math.PI * 2); ctx.fill();

      if (isEditing) _handle(ctx, anchorX, y, hoverHandle === "anchor");
      if (isSelected && !isEditing) _selectionGlow(ctx, anchorX, y);
      break;
    }
    case "path": {
      if (!obj.points || obj.points.length < 2) break;
      const pts = obj.points.map(p => ({ x: absToX(p.absIndex), y: priceToY(p.price) }));
      ctx.lineWidth = (obj.thickness || 1.5) + (isSelected || isEditing ? 0.5 : 0);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();

      if (isEditing) {
        pts.forEach((p, i) => _handle(ctx, p.x, p.y, hoverHandle === `point:${i}`));
      } else if (isSelected) {
        // Selection glow at the path's midpoint vertex
        const mid = pts[Math.floor((pts.length - 1) / 2)];
        _selectionGlow(ctx, mid.x, mid.y);
      }
      break;
    }
    case "vline": {
      const x = absToX(obj.absIndex);
      ctx.beginPath(); ctx.moveTo(x, transform.padV); ctx.lineTo(x, transform.H - transform.padV); ctx.stroke();
      if (isEditing) _handle(ctx, x, transform.padV + transform.chartH / 2, hoverHandle === "line");
      if (isSelected && !isEditing) _selectionGlow(ctx, x, transform.padV + transform.chartH / 2);
      break;
    }
    case "tline": {
      if (obj.p1 == null || obj.p2 == null) break;
      const x1 = absToX(obj.p1.absIndex), y1 = priceToY(obj.p1.price);
      const x2 = absToX(obj.p2.absIndex), y2 = priceToY(obj.p2.price);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (isEditing) { _handle(ctx, x1, y1, hoverHandle === "p1"); _handle(ctx, x2, y2, hoverHandle === "p2"); }
      if (isSelected && !isEditing) { _selectionGlow(ctx, x1, y1); _selectionGlow(ctx, x2, y2); }
      break;
    }
    case "rect": {
      if (obj.p1 == null || obj.p2 == null) break;
      const x1 = absToX(obj.p1.absIndex), y1 = priceToY(obj.p1.price);
      const x2 = absToX(obj.p2.absIndex), y2 = priceToY(obj.p2.price);
      const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
      ctx.strokeRect(rx, ry, rw, rh);
      if (isEditing) {
        _handle(ctx, x1, y1, hoverHandle === "p1"); _handle(ctx, x2, y2, hoverHandle === "p2");
        _handle(ctx, x2, y1, hoverHandle === "p3"); _handle(ctx, x1, y2, hoverHandle === "p4");
      }
      if (isSelected && !isEditing) {
        ctx.strokeStyle = "hsla(217, 91%, 78%, 0.7)";
        ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
        ctx.strokeRect(rx - 2, ry - 2, rw + 4, rh + 4);
        ctx.setLineDash([]);
      }
      break;
    }
    case "position": {
      _positionObject(ctx, transform, obj, isSelected || isEditing, isEditing, hoverHandle);
      break;
    }
    case "fib": {
      if (obj.p1 == null || obj.p2 == null) break;
      _fib(ctx, transform, obj, stroke, isEditing, hoverHandle);
      break;
    }
    case "arrow": {
      if (obj.p1 == null || obj.p2 == null) break;
      const x1 = absToX(obj.p1.absIndex), y1 = priceToY(obj.p1.price);
      const x2 = absToX(obj.p2.absIndex), y2 = priceToY(obj.p2.price);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 11 * Math.cos(angle - 0.4), y2 - 11 * Math.sin(angle - 0.4));
      ctx.lineTo(x2 - 11 * Math.cos(angle + 0.4), y2 - 11 * Math.sin(angle + 0.4));
      ctx.closePath(); ctx.fill();
      if (isEditing) { _handle(ctx, x1, y1, hoverHandle === "p1"); _handle(ctx, x2, y2, hoverHandle === "p2"); }
      if (isSelected && !isEditing) { _selectionGlow(ctx, x1, y1); _selectionGlow(ctx, x2, y2); }
      break;
    }
    case "text": {
      if (obj.price == null || obj.absIndex == null) break;
      const x = absToX(obj.absIndex), y = priceToY(obj.price);
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.fillStyle = stroke;
      ctx.fillText(obj.label || "Note", x, y - 6);
      if (isEditing) _handle(ctx, x, y, hoverHandle === "body");
      if (isSelected && !isEditing) _selectionGlow(ctx, x, y);
      break;
    }
  }
}

// ─── Layer 6b: Stateful replay trades (state overlays only — active/completed) ────
// Position objects are rendered by renderDrawingsLayer.
// This layer adds state-colored overlays only when a trade becomes active or hits TP/SL.
export function renderReplayTradesLayer(ctx, transform, replayTrades) {
  if (!replayTrades?.length) return;

  for (const trade of replayTrades) {
    // The position object itself owns Entry / SL / TP rendering.
    // This layer only adds the trade-state badge so the position
    // remains one unified Long/Short tool instead of being redrawn.
    if (trade.state === "active" || trade.state === "tp_hit" || trade.state === "sl_hit") {
      _drawReplayTradeStateBadge(ctx, transform, trade);
    }
  }
}

function _drawReplayTradeStateBadge(ctx, transform, trade) {
  const { priceToY, absToX } = transform;
  const isLong = trade.direction === "Buy";

  const startAbsIndex = trade.startAbsIndex ?? trade.placedAtIndex ?? 0;
  const widthCandles = trade.widthCandles ?? 30;

  const L = absToX(startAbsIndex);
  const R = absToX(startAbsIndex + widthCandles);

  if (R <= L) return;

  const entryY = priceToY(trade.entry);
  const tpY = trade.tp != null ? priceToY(trade.tp) : null;

  const stateMap = {
    active: "ACTIVE",
    tp_hit: "✓ WIN",
    sl_hit: "✗ LOSS",
  };

  const badge = stateMap[trade.state] || trade.state;
  const colors = _tradeStateColor(trade.state);

  const midY = tpY != null ? (entryY + tpY) / 2 : entryY;

  ctx.save();

  ctx.font = "bold 9px Inter, sans-serif";
  ctx.textAlign = "left";

  const tw = ctx.measureText(badge).width + 10;

  ctx.fillStyle = colors.entry.replace("1)", "0.8)");
  ctx.beginPath();
  ctx.roundRect(L + 6, midY - 8, tw, 16, 3);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.fillText(badge, L + 11, midY + 4);

  ctx.restore();
}
// Inline trade state colors
function _tradeStateColor(state) {
  switch (state) {
    case "active":  return { entry: "hsla(217,91%,65%,0.95)", tp: "hsla(142,71%,50%,0.9)", sl: "hsla(0,72%,55%,0.9)",  fill: "hsla(217,91%,60%,0.08)" };
    case "tp_hit":  return { entry: "hsla(142,71%,55%,0.9)",  tp: "hsla(142,71%,60%,0.9)", sl: "hsla(142,55%,40%,0.5)", fill: "hsla(142,71%,45%,0.12)" };
    case "sl_hit":  return { entry: "hsla(0,72%,60%,0.9)",    tp: "hsla(0,55%,45%,0.5)",   sl: "hsla(0,72%,65%,0.9)",  fill: "hsla(0,72%,51%,0.12)" };
    default:        return { entry: "hsla(210,20%,65%,0.9)",  tp: "hsla(210,20%,55%,0.7)", sl: "hsla(210,20%,55%,0.7)", fill: "hsla(210,20%,55%,0.06)" };
  }
}

// ─── Layer 7: Active trade lines ─────────────────────────────────────────────
export function renderActiveTradeLayer(ctx, transform, activeTrade) {
  if (!activeTrade) return;
  _tradeLine(ctx, transform, activeTrade.entryPrice, C.posEntry, "ENT");
  _tradeLine(ctx, transform, activeTrade.sl,         C.posSL,    "SL ");
  _tradeLine(ctx, transform, activeTrade.tp,         C.posTP,    "TP ");
}

// ─── Layer 8: Current price badge + horizontal ray ────────────────────────────
export function renderPriceBadge(ctx, transform, price) {
  if (price == null) return;
  const { priceToY, W } = transform;
  const y = priceToY(price);

  ctx.strokeStyle = "hsla(217, 91%, 60%, 0.35)";
  ctx.lineWidth = 0.75; ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.moveTo(PADDING_L, y); ctx.lineTo(W - transform.padR, y); ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = C.price;
  ctx.beginPath(); ctx.arc(W - transform.padR - 1, y, 3, 0, Math.PI * 2); ctx.fill();

  const bw = transform.padR - 4;
  ctx.fillStyle = C.price;
  ctx.beginPath(); ctx.roundRect(W - transform.padR + 2, y - 10, bw, 20, 3); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 9px JetBrains Mono, monospace";
  ctx.textAlign = "left";
  ctx.fillText(price.toFixed(priceDecimals(price)), W - transform.padR + 6, y + 4);
  ctx.textAlign = "left";
}

// ─── Layer 8b: Crosshair (TradingView-style hover guide) ─────────────────────
export function renderCrosshairLayer(ctx, transform, mousePrice, mouseAbsIndex, visibleCandles, theme = "dark") {
  if (mousePrice == null || mouseAbsIndex == null) return;
  const T = getC(theme);
  const { priceToY, absToX, W, H, padV, padR, chartBottom } = transform;
  const x = absToX(mouseAbsIndex);
  const y = priceToY(mousePrice);

  // Skip drawing if the cursor has wandered off the plottable chart area
  if (x < PADDING_L || x > W - padR || y < padV || y > chartBottom) return;

  ctx.save();
  ctx.strokeStyle = theme === "light" ? "rgba(15,23,42,0.35)" : "rgba(226,232,240,0.35)";
  ctx.lineWidth = 0.75;
  ctx.setLineDash([2, 4]);

  // Vertical guide (time)
  ctx.beginPath();
  ctx.moveTo(x, padV);
  ctx.lineTo(x, chartBottom);
  ctx.stroke();

  // Horizontal guide (price)
  ctx.beginPath();
  ctx.moveTo(PADDING_L, y);
  ctx.lineTo(W - padR, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Price label on the axis
  const priceLabel = mousePrice.toFixed(priceDecimals(mousePrice));
  ctx.font = "bold 9px JetBrains Mono, monospace";
  const priceLabelW = ctx.measureText(priceLabel).width + 10;
  ctx.fillStyle = theme === "light" ? "#334155" : "#475569";
  ctx.beginPath();
  ctx.roundRect(W - padR + 2, y - 10, priceLabelW, 20, 3);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.fillText(priceLabel, W - padR + 6, y + 4);

  // Time label on the axis, from the nearest visible candle's timestamp
  const localIdx = mouseAbsIndex - transform.sliceStart;
  const candle = visibleCandles?.[Math.round(localIdx)];
  if (candle?.time) {
    const dt = new Date(candle.time);
    const timeLabel = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    ctx.font = "bold 9px JetBrains Mono, monospace";
    const timeLabelW = ctx.measureText(timeLabel).width + 10;
    ctx.fillStyle = theme === "light" ? "#334155" : "#475569";
    ctx.beginPath();
    ctx.roundRect(Math.max(PADDING_L, x - timeLabelW / 2), chartBottom + 3, timeLabelW, 15, 3);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(timeLabel, Math.max(PADDING_L, x - timeLabelW / 2) + timeLabelW / 2, chartBottom + 14);
    ctx.textAlign = "left";
  }
  ctx.restore();
}

// ─── Layer 9: Ghost (in-progress drawing) ────────────────────────────────────
export function renderGhostLayer(ctx, transform, ghost, mousePrice, mouseAbsIndex) {
  if (!ghost) return;
  const { priceToY, absToX, W } = transform;

  if (ghost.type === "hline") {
    const y = priceToY(mousePrice);
    ctx.strokeStyle = "hsla(45,93%,58%,0.55)"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(PADDING_L, y); ctx.lineTo(W - transform.padR, y); ctx.stroke();
    ctx.setLineDash([]);
  } else if (ghost.type === "ray") {
    const x = absToX(mouseAbsIndex);
    const y = priceToY(mousePrice);
    ctx.strokeStyle = "hsla(45,93%,58%,0.55)"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(W - transform.padR, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "hsla(45,93%,58%,0.75)";
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (ghost.type === "vline") {
    const x = absToX(mouseAbsIndex);
    ctx.strokeStyle = "hsla(45,93%,58%,0.55)"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(x, transform.padV); ctx.lineTo(x, transform.H - transform.padV); ctx.stroke();
    ctx.setLineDash([]);
  } else if (ghost.type === "path") {
    const pts = ghost.points.map(p => ({ x: absToX(p.absIndex), y: priceToY(p.price) }));
    ctx.strokeStyle = "hsla(45,93%,58%,0.75)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    // Rubber-band segment from the last confirmed point to the cursor
    const cx = absToX(mouseAbsIndex), cy = priceToY(mousePrice);
    ctx.strokeStyle = "hsla(45,93%,58%,0.4)"; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.setLineDash([]);
    // Vertex dots so each confirmed click point is visible while drawing
    ctx.fillStyle = "hsla(45,93%,58%,0.9)";
    for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill(); }
  } else if (ghost.p1 != null) {
    const x1 = absToX(ghost.p1.absIndex), y1 = priceToY(ghost.p1.price);
    const p2 = mousePrice != null && mouseAbsIndex != null
      ? { price: mousePrice, absIndex: mouseAbsIndex }
      : ghost.p2;
    if (!p2) return;
    const x2 = absToX(p2.absIndex), y2 = priceToY(p2.price);
    ctx.strokeStyle = "hsla(45,93%,58%,0.55)"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
    if (ghost.type === "fib") {
      _fib(ctx, transform, { ...ghost, p2 }, "hsla(45,93%,58%,0.75)", false, null);
    } else if (ghost.type === "arrow") {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.fillStyle = "hsla(45,93%,58%,0.75)";
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 11 * Math.cos(angle - 0.4), y2 - 11 * Math.sin(angle - 0.4));
      ctx.lineTo(x2 - 11 * Math.cos(angle + 0.4), y2 - 11 * Math.sin(angle + 0.4));
      ctx.closePath(); ctx.fill();
    }
    if (ghost.type === "rect") {
      ctx.strokeStyle = "hsla(45,93%,58%,0.75)";
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
    _handle(ctx, x1, y1, true);
  }
}

// ─── Layer 10: Indicator panels (RSI / MACD / ATR / Volume) ──────────────────
export function renderIndicatorPanels(ctx, transform, visibleCandles, indicatorSeries, panelKeys, theme = "dark") {
  if (!panelKeys?.length) return;
  const T = getC(theme);
  const panels = _buildPanelLayout(transform, panelKeys);
  for (const panel of panels) {
    const data = indicatorSeries?.panels?.[panel.key];
    if (!data) continue;
    _panelBase(ctx, panel, data.label, T);
    if (panel.key === "volume") _volumePanel(ctx, transform, panel, visibleCandles, data.values);
    if (panel.key === "rsi")    _rsiPanel(ctx, transform, panel, data.values);
    if (panel.key === "macd")   _macdPanel(ctx, transform, panel, data.values);
    if (panel.key === "atr")    _valuePanel(ctx, transform, panel, data.values, data.color);
  }
}

// ─── Helpers: private ─────────────────────────────────────────────────────────

function _tradeLine(ctx, transform, price, color, lbl) {
  if (price == null) return;
  const { priceToY, W } = transform;
  const y = priceToY(price);
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(PADDING_L, y); ctx.lineTo(W - transform.padR, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = "bold 9px JetBrains Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText(`${lbl} ${price.toFixed(priceDecimals(price))}`, W - transform.padR - 6, y + 3);
  ctx.textAlign = "left";
}

function _handle(ctx, x, y, hot = false) {
  ctx.fillStyle = hot ? C.handleHot : C.handle;
  ctx.strokeStyle = hot ? "white" : C.handle;
  ctx.lineWidth = 1.5; ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(x, y, HANDLE_R + (hot ? 2 : 0), 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
}

function _selectionGlow(ctx, x, y) {
  ctx.fillStyle = "hsla(217, 91%, 78%, 0.55)";
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
}

function _seriesLine(ctx, transform, values, color, width = 1.2, alpha = 1, yForValue) {
  const yFn = yForValue || transform.priceToY;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.setLineDash([]);
  ctx.beginPath();
  let started = false;
  const start = Math.max(0, transform.sliceStart - 1);
  const end   = Math.min(values.length, transform.sliceStart + transform.n + 1);
  for (let i = start; i < end; i++) {
    const v = values[i];
    if (v == null || Number.isNaN(v)) { started = false; continue; }
    const x = transform.absToX(i) + transform.candleW / 2;
    const y = yFn(v);
    if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
  }
  ctx.stroke();
  ctx.restore();
}

function _bandFill(ctx, transform, upper, lower, color) {
  const points = [];
  const start = transform.sliceStart;
  const end   = Math.min(upper.length, transform.sliceStart + transform.n);
  for (let i = start; i < end; i++) {
    if (upper[i] != null && lower[i] != null) points.push({ i, upper: upper[i], lower: lower[i] });
  }
  if (points.length < 2) return;
  ctx.save();
  ctx.fillStyle = color.replace("hsl(", "hsla(").replace(")", ",0.08)");
  ctx.beginPath();
  points.forEach((p, idx) => {
    const x = transform.absToX(p.i) + transform.candleW / 2;
    idx === 0 ? ctx.moveTo(x, transform.priceToY(p.upper)) : ctx.lineTo(x, transform.priceToY(p.upper));
  });
  [...points].reverse().forEach(p => {
    ctx.lineTo(transform.absToX(p.i) + transform.candleW / 2, transform.priceToY(p.lower));
  });
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function _fib(ctx, transform, obj, stroke, isEditing, hoverHandle) {
  const { priceToY, absToX } = transform;
  const x1 = absToX(obj.p1.absIndex), y1 = priceToY(obj.p1.price);
  const x2 = absToX(obj.p2.absIndex), y2 = priceToY(obj.p2.price);
  // Bounded between anchor points — compact, local rendering like TradingView/MT5
  const left  = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const labelX = right + 6; // labels just right of the right anchor
  const priceDelta = obj.p2.price - obj.p1.price;

  // Clamp within chart area
  const chartRight = transform.W - transform.padR - 2;
  const effectiveRight = Math.min(right, chartRight);
  const labelRight = Math.min(labelX + 70, chartRight - 2);

  ctx.save();
  ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
  ctx.globalAlpha = 0.85;

  // Standard retracement convention (TradingView / MT4): 0% sits at the
  // SECOND anchor point (the more recent price — "no retracement yet"),
  // 100% sits at the FIRST anchor (full retracement back to the start of
  // the move). Previously this computed price = p1 + delta*level, which
  // anchors 0% at the first click instead — every level's price ended up
  // mirrored onto the wrong label (what showed as "38.2%" was actually
  // sitting at the 61.8% position, and so on).
  FIB_LEVELS.forEach(level => {
    const price = obj.p2.price - priceDelta * level;
    const y = priceToY(price);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(effectiveRight, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = stroke;
    ctx.font = "8.5px JetBrains Mono, monospace";
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
    ctx.fillText(`${level} · ${price.toFixed(priceDecimals(price))}`, Math.min(effectiveRight + 4, chartRight - 68), y + 3);
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([4, 3]);
  });

  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // Spine line between anchors
  ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();

  if (isEditing) {
    _handle(ctx, x1, y1, hoverHandle === "p1");
    _handle(ctx, x2, y2, hoverHandle === "p2");
  }
}

/**
 * TradingView-style Position Tool Renderer — Compact, fixed-width, resizable.
 *
 * Object stores: entry/tp/sl (price), startAbsIndex (left edge in data space),
 * widthCandles (width in candle units, default 30).
 * This keeps the object anchored to data space so it survives zoom/pan.
 */
const POS_DEFAULT_WIDTH_CANDLES = 30;

function _positionObject(ctx, transform, obj, isSelected, isEditing, hoverHandle) {
  const { priceToY, absToX, candleW } = transform;
  if (obj.entry == null || obj.tp == null || obj.sl == null) return;

  const isLong  = obj.direction !== "Sell";
  const dec     = priceDecimals(obj.entry);

  // ── Compute pixel bounds from data-space anchors ──────────────────────────
  const startAbsIndex = obj.startAbsIndex ?? obj.p1?.absIndex ?? obj.placedAtIndex ?? 0;
  const widthCandles  = obj.widthCandles  ?? POS_DEFAULT_WIDTH_CANDLES;
  const L = absToX(startAbsIndex);
  const R = absToX(startAbsIndex + widthCandles);
  const w = R - L;
  if (w <= 0) return;

  const entryY = priceToY(obj.entry);
  const tpY    = priceToY(obj.tp);
  const slY    = priceToY(obj.sl);

  const tpColor    = isLong ? "hsla(142,71%,50%,1)"    : "hsla(0,72%,55%,1)";
  const slColor    = isLong ? "hsla(0,72%,55%,1)"      : "hsla(142,71%,50%,1)";
  const entryColor = "hsla(217,91%,65%,1)";
  const tpFill     = isLong ? "hsla(142,71%,45%,0.18)" : "hsla(0,72%,51%,0.18)";
  const slFill     = isLong ? "hsla(0,72%,51%,0.18)"   : "hsla(142,71%,45%,0.18)";

  const risk   = Math.abs(obj.entry - obj.sl);
  const reward = Math.abs(obj.tp - obj.entry);
  const rr     = risk > 0 ? (reward / risk).toFixed(2) : "0.00";

  ctx.save();

  // ── Zone fills (clipped to object width) ─────────────────────────────────
  ctx.fillStyle = tpFill;
  ctx.fillRect(L, Math.min(tpY, entryY), w, Math.abs(tpY - entryY));
  ctx.fillStyle = slFill;
  ctx.fillRect(L, Math.min(slY, entryY), w, Math.abs(slY - entryY));

  // ── TP line ───────────────────────────────────────────────────────────────
  ctx.strokeStyle = tpColor;
  ctx.lineWidth = hoverHandle === "T" ? 2 : 1.5;
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(L, tpY); ctx.lineTo(R, tpY); ctx.stroke();

  // ── SL line ───────────────────────────────────────────────────────────────
  ctx.strokeStyle = slColor;
  ctx.lineWidth = hoverHandle === "S" ? 2 : 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(L, slY); ctx.lineTo(R, slY); ctx.stroke();
  ctx.setLineDash([]);

  // ── Entry line ────────────────────────────────────────────────────────────
  ctx.strokeStyle = entryColor;
  ctx.lineWidth = hoverHandle === "E" ? 2.5 : 2;
  ctx.beginPath(); ctx.moveTo(L, entryY); ctx.lineTo(R, entryY); ctx.stroke();

  // ── Inline labels (inside object, right-side) ─────────────────────────────
  ctx.font = "bold 9px JetBrains Mono, monospace";
  ctx.textAlign = "right";
  const labelX = R - 6;
  ctx.fillStyle = tpColor;
  ctx.fillText(`${isLong ? "▲" : "▼"} TP ${obj.tp.toFixed(dec)}`, labelX, tpY - 3);
  ctx.fillStyle = slColor;
  ctx.fillText(`${isLong ? "▼" : "▲"} SL ${obj.sl.toFixed(dec)}`, labelX, slY + 10);
  ctx.fillStyle = entryColor;
  ctx.fillText(`⊙ ${obj.entry.toFixed(dec)}`, labelX, entryY - 3);

  // ── RR badge inside TP zone ───────────────────────────────────────────────
  if (Math.abs(tpY - entryY) > 22) {
    const rrLabel = `RR ${rr}`;
    ctx.font = "bold 9px Inter, sans-serif";
    const rrTw = ctx.measureText(rrLabel).width + 10;
    const rrMidY = (entryY + tpY) / 2;
    const rrX = L + 6;
    ctx.fillStyle = isLong ? "hsla(142,71%,35%,0.85)" : "hsla(0,72%,40%,0.85)";
    ctx.beginPath(); ctx.roundRect(rrX, rrMidY - 8, rrTw, 16, 3); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText(rrLabel, rrX + 5, rrMidY + 4);
  }

  // ── Profit/Risk pts inside zones ─────────────────────────────────────────
  ctx.font = "9px Inter, sans-serif";
  ctx.textAlign = "left";
  if (Math.abs(tpY - entryY) > 28) {
    ctx.fillStyle = isLong ? "hsla(142,71%,75%,0.7)" : "hsla(0,72%,75%,0.7)";
    const midTP = (entryY + tpY) / 2;
    ctx.fillText(`+${reward.toFixed(dec)}`, L + 6, midTP + (Math.abs(tpY - entryY) > 40 ? 14 : 4));
  }
  if (Math.abs(slY - entryY) > 28) {
    ctx.fillStyle = isLong ? "hsla(0,72%,75%,0.7)" : "hsla(142,71%,75%,0.7)";
    const midSL = (entryY + slY) / 2;
    ctx.fillText(`-${risk.toFixed(dec)}`, L + 6, midSL + 4);
  }

  // ── Selection outline ─────────────────────────────────────────────────────
  if (isSelected || isEditing) {
    const zTop = Math.min(tpY, slY);
    const zBot = Math.max(tpY, slY);
    ctx.strokeStyle = isEditing ? "hsla(217,91%,70%,0.55)" : "hsla(217,91%,60%,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(L, zTop, w, zBot - zTop);
    ctx.setLineDash([]);
  }

  // ── Price/Resize handles ──────────────────────────────────────────────────
  if (isSelected || isEditing) {
    // Vertical price handles (T/E/S) on left edge
    [
      { key: "T", y: tpY,    color: tpColor },
      { key: "E", y: entryY, color: entryColor },
      { key: "S", y: slY,    color: slColor },
    ].forEach(({ key, y, color }) => {
      const hot = hoverHandle === key;
      ctx.fillStyle = hot ? "#fff" : color;
      ctx.strokeStyle = color;
      ctx.lineWidth = hot ? 2 : 1.5;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(L + 7, y, HANDLE_R + (hot ? 1 : 0), 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });

    // Horizontal resize handles (RL = left edge, RR = right edge) at entry midpoint
    const resizeMidY = entryY;
    [{ key: "RL", x: L }, { key: "RR", x: R }].forEach(({ key, x }) => {
      const hot = hoverHandle === key;
      ctx.fillStyle = hot ? "#fff" : "hsla(210,20%,70%,0.9)";
      ctx.strokeStyle = "hsla(210,20%,50%,0.8)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      // Draw as a small vertical bar handle
      ctx.beginPath();
      ctx.roundRect(x - 4, resizeMidY - 10, 8, 20, 3);
      ctx.fill(); ctx.stroke();
    });
  }

  ctx.restore();
}

// Small inline axis label — no background box, just colored text
function _axisLabel(ctx, x, y, text, color) {
  ctx.fillStyle = color;
  ctx.font = "bold 9px JetBrains Mono, monospace";
  ctx.textAlign = "left";
  ctx.fillText(text, x, y + 3.5);
}

function _buildPanelLayout(transform, panelKeys) {
  const gap = 4;
  const top = transform.chartBottom + 24;
  const available = Math.max(0, transform.H - top - 8);
  const panelH = Math.max(48, (available - gap * (panelKeys.length - 1)) / panelKeys.length);
  return panelKeys.map((key, i) => ({
    key,
    x: PADDING_L,
    y: top + i * (panelH + gap),
    w: transform.W - PADDING_L - transform.padR,
    h: panelH,
  }));
}

function _panelBase(ctx, panel, label, T = C) {
  ctx.fillStyle = T.panelBg;
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  ctx.strokeStyle = T.panelLine; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(panel.x, panel.y); ctx.lineTo(panel.x + panel.w, panel.y); ctx.stroke();
  ctx.fillStyle = T.timeText;
  ctx.font = "bold 9px Inter, sans-serif";
  ctx.fillText(label, panel.x + 6, panel.y + 13);
  ctx.strokeStyle = T.grid; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(panel.x, panel.y + panel.h / 2); ctx.lineTo(panel.x + panel.w, panel.y + panel.h / 2); ctx.stroke();
}

function _volumePanel(ctx, transform, panel, visibleCandles, values) {
  const visible = values.slice(transform.sliceStart, transform.sliceStart + transform.n);
  const max = Math.max(1, ...visible.map(v => v?.value || 0));
  visibleCandles.forEach((c, li) => {
    const ai = transform.sliceStart + li;
    const v = values[ai]?.value || 0;
    const h = Math.max(1, (v / max) * (panel.h - 18));
    const x = transform.localToX(li);
    ctx.fillStyle = c.close >= c.open ? "hsla(142,71%,45%,0.65)" : "hsla(0,72%,51%,0.65)";
    ctx.fillRect(x, panel.y + panel.h - h - 2, Math.max(1, transform.candleW), h);
  });
}

function _rsiPanel(ctx, transform, panel, values) {
  const yFor = v => panel.y + ((100 - v) / 100) * panel.h;
  [70, 30].forEach(level => {
    ctx.strokeStyle = "hsla(45,93%,58%,0.35)"; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(panel.x, yFor(level)); ctx.lineTo(panel.x + panel.w, yFor(level)); ctx.stroke();
    ctx.setLineDash([]);
  });
  _seriesLine(ctx, transform, values, "hsl(45,93%,58%)", 1.2, 1, yFor);
}

function _macdPanel(ctx, transform, panel, values) {
  const all = [...values.line, ...values.signal, ...values.hist].filter(v => v != null);
  const max = Math.max(0.00001, ...all.map(v => Math.abs(v)));
  const yFor = v => panel.y + panel.h / 2 - (v / max) * (panel.h * 0.42);
  const start = transform.sliceStart;
  const end   = Math.min(values.hist.length, transform.sliceStart + transform.n);
  for (let i = start; i < end; i++) {
    const v = values.hist[i];
    if (v == null) continue;
    const x = transform.absToX(i);
    const zero = yFor(0);
    ctx.fillStyle = v >= 0 ? "hsla(142,71%,45%,0.7)" : "hsla(0,72%,51%,0.7)";
    ctx.fillRect(x, yFor(Math.max(v, 0)), Math.max(1, transform.candleW), Math.max(1, Math.abs(zero - yFor(v))));
  }
  _seriesLine(ctx, transform, values.line,   "hsl(217,91%,65%)", 1.2, 1, yFor);
  _seriesLine(ctx, transform, values.signal, "hsl(45,93%,58%)",  1.1, 1, yFor);
}

function _valuePanel(ctx, transform, panel, values, color) {
  const visible = values.slice(transform.sliceStart, transform.sliceStart + transform.n).filter(v => v != null);
  if (!visible.length) return;
  const min = Math.min(...visible), max = Math.max(...visible);
  const range = max - min || 1;
  const yFor = v => panel.y + panel.h - 4 - ((v - min) / range) * (panel.h - 18);
  _seriesLine(ctx, transform, values, color || "hsl(190,90%,55%)", 1.2, 1, yFor);
}

function _clipChart(ctx, transform, render) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(PADDING_L, transform.padV, transform.W - PADDING_L - transform.padR, transform.chartH);
  ctx.clip();
  render();
  ctx.restore();
}

/**
 * Full composite render — call once per frame.
 * theme: "dark" | "light"
 * chartSettings: { bullBody, bearBody, bullWick, bearWick, showVolume, showGrid }
 */
export function renderFrame(ctx, {
  transform, visibleCandles, objects, selectedId, editingId, hoveredId, hoverHandle,
  activeTrade, indicatorSeries, indicatorPanels,
  ghost, mousePrice, mouseAbsIndex, currentPrice, theme = "dark", chartSettings = {},
  replayTrades = [], showCrosshair = false,
}) {
  // Filter volume panel based on showVolume setting
  const filteredPanels = chartSettings.showVolume === false
    ? (indicatorPanels || []).filter(k => k !== "volume")
    : indicatorPanels;

renderGridLayer(ctx, transform, theme, chartSettings);
_clipChart(ctx, transform, () => {
  renderCandleLayer(ctx, transform, visibleCandles, theme, chartSettings);
  renderIndicatorOverlayLayer(ctx, transform, indicatorSeries);
  renderActiveTradeLayer(ctx, transform, activeTrade);
  renderDrawingsLayer(ctx, transform, objects, selectedId, editingId, hoveredId, hoverHandle);
  renderReplayTradesLayer(ctx, transform, replayTrades);
  renderGhostLayer(ctx, transform, ghost, mousePrice, mouseAbsIndex);
});
renderPriceBadge(ctx, transform, currentPrice);
  if (showCrosshair) {
    renderCrosshairLayer(ctx, transform, mousePrice, mouseAbsIndex, visibleCandles, theme);
  }
 renderIndicatorPanels(ctx, transform, visibleCandles, indicatorSeries, filteredPanels, theme);
renderTimeAxis(ctx, transform, visibleCandles, theme);
renderDayDividers(ctx, transform, visibleCandles, theme);
}
