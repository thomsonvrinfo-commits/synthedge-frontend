/**
 * SynthEdge Object Interaction Service
 * Hit-testing, handle detection, drag/resize state — all in price+index space.
 *
 * Interaction model (TradingView / Figma style):
 *   HOVER    — cursor changes, object brightens
 *   SELECTED — single-click; object highlighted, NO handles shown
 *   EDITING  — double-click; handles/endpoints visible and draggable
 *
 * Drag is ONLY possible when an object is in EDITING state.
 */

import { HANDLE_R, PADDING_L } from "./chartEngine.js";

const HIT_PX                    = 10;
const HANDLE_HIT_PX             = 13;
const RECT_HIT                  = 8;
const POS_DEFAULT_WIDTH_CANDLES = 30;

// ─── Hit testing ─────────────────────────────────────────────────────────────

export function hitTestObjects(objects, mouseX, mouseY, transform, options = {}) {
  const { includeHandles = false } = options;
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    const hit = hitTestObject(obj, mouseX, mouseY, transform, { includeHandles });
    if (hit) return { id: obj.id, handleKey: hit.handleKey };
  }
  return null;
}

export function hitTestObject(obj, mx, my, transform, options = {}) {
  const { includeHandles = false } = options;
  const { priceToY, absToX } = transform;
  if (!priceToY || !absToX) return null;

  switch (obj.type) {
    case "hline": {
      if (obj.price == null) return null;
      const y = priceToY(obj.price);
      if (Math.abs(my - y) < HIT_PX) return { handleKey: "line" };
      return null;
    }
    case "ray": {
      if (obj.price == null || obj.absIndex == null) return null;
      const y = priceToY(obj.price);
      if (Math.abs(my - y) > HIT_PX) return null;
      const anchorX = absToX(obj.absIndex);
      if (includeHandles && Math.abs(mx - anchorX) < HANDLE_HIT_PX) return { handleKey: "anchor" };
      const leftEdge = PADDING_L, rightEdge = transform.W - transform.padR;
      const startX = obj.extendLeft ? leftEdge : anchorX;
      const endX = obj.extendRight !== false ? rightEdge : anchorX;
      if (mx >= Math.min(startX, endX) - HIT_PX && mx <= Math.max(startX, endX) + HIT_PX) {
        return { handleKey: "line" };
      }
      return null;
    }
    case "vline": {
      if (obj.absIndex == null) return null;
      const x = absToX(obj.absIndex);
      if (Math.abs(mx - x) < HIT_PX) return { handleKey: "line" };
      return null;
    }
    case "tline":
    case "arrow":
    case "fib": {
      if (!obj.p1 || !obj.p2) return null;
      const x1 = absToX(obj.p1.absIndex), y1 = priceToY(obj.p1.price);
      const x2 = absToX(obj.p2.absIndex), y2 = priceToY(obj.p2.price);
      if (includeHandles) {
        if (dist(mx, my, x1, y1) < HANDLE_HIT_PX) return { handleKey: "p1" };
        if (dist(mx, my, x2, y2) < HANDLE_HIT_PX) return { handleKey: "p2" };
      }
      if (pointNearSegment(mx, my, x1, y1, x2, y2, HIT_PX)) return { handleKey: "body" };
      return null;
    }
    case "rect": {
      return hitRectLike(obj, mx, my, transform, includeHandles);
    }
    case "position": {
      return hitPositionObject(obj, mx, my, transform, includeHandles);
    }
    case "path": {
      if (!obj.points || obj.points.length < 2) return null;
      const pts = obj.points.map(p => ({ x: absToX(p.absIndex), y: priceToY(p.price) }));
      if (includeHandles) {
        for (let i = 0; i < pts.length; i++) {
          if (dist(mx, my, pts[i].x, pts[i].y) < HANDLE_HIT_PX) return { handleKey: `point:${i}` };
        }
      }
      for (let i = 0; i < pts.length - 1; i++) {
        if (pointNearSegment(mx, my, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, HIT_PX)) {
          return { handleKey: "body" };
        }
      }
      return null;
    }
    case "text": {
      if (obj.price == null || obj.absIndex == null) return null;
      const x = absToX(obj.absIndex), y = priceToY(obj.price);
      if (Math.abs(mx - x) < 40 && Math.abs(my - y) < 14) return { handleKey: "body" };
      return null;
    }
  }
  return null;
}

// Position objects — compact, fixed-width hit testing
function hitPositionObject(obj, mx, my, transform, includeHandles) {
  const { priceToY, absToX } = transform;
  if (obj.entry == null || obj.tp == null || obj.sl == null) return null;

  const startAbsIndex = obj.startAbsIndex ?? obj.p1?.absIndex ?? obj.placedAtIndex ?? 0;
  const widthCandles  = obj.widthCandles  ?? POS_DEFAULT_WIDTH_CANDLES;
  const L = absToX(startAbsIndex);
  const R = absToX(startAbsIndex + widthCandles);

  const entryY = priceToY(obj.entry);
  const tpY    = priceToY(obj.tp);
  const slY    = priceToY(obj.sl);

  // Only hit-test within horizontal bounds (with a bit of tolerance)
  if (mx < L - RECT_HIT || mx > R + RECT_HIT) return null;

  // Left resize handle (RL) — left edge bar
  if (includeHandles && Math.abs(mx - L) < 8 && Math.abs(my - entryY) < 14) return { handleKey: "RL" };
  // Right resize handle (RR) — right edge bar
  if (includeHandles && Math.abs(mx - R) < 8 && Math.abs(my - entryY) < 14) return { handleKey: "RR" };

  // Vertical price line handles (T/E/S)
  const lineHitPx = 8;
  if (Math.abs(my - tpY)    < lineHitPx) return { handleKey: "T" };
  if (Math.abs(my - entryY) < lineHitPx) return { handleKey: "E" };
  if (Math.abs(my - slY)    < lineHitPx) return { handleKey: "S" };

  // Body — anywhere in zone
  const zoneTop    = Math.min(tpY, slY) - RECT_HIT;
  const zoneBottom = Math.max(tpY, slY) + RECT_HIT;
  if (my >= zoneTop && my <= zoneBottom) return { handleKey: "body" };

  return null;
}

function hitRectLike(obj, mx, my, transform, includeHandles) {
  const { priceToY, absToX } = transform;
  if (!obj.p1 || !obj.p2) return null;
  const x1 = absToX(obj.p1.absIndex), y1 = priceToY(obj.p1.price);
  const x2 = absToX(obj.p2.absIndex), y2 = priceToY(obj.p2.price);
  const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
  const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
  if (includeHandles) {
    if (dist(mx, my, x1, y1) < HANDLE_HIT_PX) return { handleKey: "p1" };
    if (dist(mx, my, x2, y2) < HANDLE_HIT_PX) return { handleKey: "p2" };
    if (dist(mx, my, x2, y1) < HANDLE_HIT_PX) return { handleKey: "p3" };
    if (dist(mx, my, x1, y2) < HANDLE_HIT_PX) return { handleKey: "p4" };
  }
  if (mx > rx - RECT_HIT && mx < rx + rw + RECT_HIT &&
      my > ry - RECT_HIT && my < ry + rh + RECT_HIT) return { handleKey: "body" };
  return null;
}

// ─── Position tool handle detection ─────────────────────────────────────────

export function hitTestPositionHandles(pos, mx, my, transform) {
  if (!pos || pos.entry == null) return null;
  const { priceToY } = transform;
  const handleX = PADDING_L + 14;
  const targets = [
    { key: "E", y: priceToY(pos.entry) },
    ...(pos.sl != null ? [{ key: "S", y: priceToY(pos.sl) }] : []),
    ...(pos.tp != null ? [{ key: "T", y: priceToY(pos.tp) }] : []),
  ];
  for (const t of targets) {
    if (dist(mx, my, handleX, t.y) < HANDLE_R + 6) return t.key;
    if (Math.abs(my - t.y) < HIT_PX) return t.key;
  }
  return null;
}

// ─── Drag apply ─────────────────────────────────────────────────────────────

export function applyDrag(obj, handleKey, dPrice, dIndex) {
  switch (obj.type) {
    case "hline":
      return { ...obj, price: obj.price + dPrice };
    case "ray":
      return { ...obj, price: obj.price + dPrice, absIndex: obj.absIndex + dIndex };
    case "vline":
      return { ...obj, absIndex: Math.round(obj.absIndex + dIndex) };
    case "tline":
    case "arrow":
    case "fib": {
      if (handleKey === "p1")
        return { ...obj, p1: { absIndex: obj.p1.absIndex + dIndex, price: obj.p1.price + dPrice } };
      if (handleKey === "p2")
        return { ...obj, p2: { absIndex: obj.p2.absIndex + dIndex, price: obj.p2.price + dPrice } };
      return {
        ...obj,
        p1: { absIndex: obj.p1.absIndex + dIndex, price: obj.p1.price + dPrice },
        p2: { absIndex: obj.p2.absIndex + dIndex, price: obj.p2.price + dPrice },
      };
    }
    case "rect": {
      if (handleKey === "p1") return { ...obj, p1: { absIndex: obj.p1.absIndex + dIndex, price: obj.p1.price + dPrice } };
      if (handleKey === "p2") return { ...obj, p2: { absIndex: obj.p2.absIndex + dIndex, price: obj.p2.price + dPrice } };
      if (handleKey === "p3") return { ...obj, p1: { ...obj.p1, price: obj.p1.price + dPrice }, p2: { ...obj.p2, absIndex: obj.p2.absIndex + dIndex } };
      if (handleKey === "p4") return { ...obj, p1: { ...obj.p1, absIndex: obj.p1.absIndex + dIndex }, p2: { ...obj.p2, price: obj.p2.price + dPrice } };
      return {
        ...obj,
        p1: { absIndex: obj.p1.absIndex + dIndex, price: obj.p1.price + dPrice },
        p2: { absIndex: obj.p2.absIndex + dIndex, price: obj.p2.price + dPrice },
      };
    }
    case "position": {
      const startAbsIndex = obj.startAbsIndex ?? obj.p1?.absIndex ?? obj.placedAtIndex ?? 0;
      const widthCandles  = obj.widthCandles ?? POS_DEFAULT_WIDTH_CANDLES;
      // T = TP only, S = SL only, E = entry only
      if (handleKey === "T") return { ...obj, tp: obj.tp + dPrice };
      if (handleKey === "S") return { ...obj, sl: obj.sl + dPrice };
      if (handleKey === "E") return { ...obj, entry: obj.entry + dPrice };
      // RL = drag left edge (resize width, keep right edge fixed)
      if (handleKey === "RL") {
        const newStart = startAbsIndex + dIndex;
        const newWidth = widthCandles - dIndex;
        if (newWidth < 5) return obj; // min width guard
        return { ...obj, startAbsIndex: newStart, widthCandles: newWidth };
      }
      // RR = drag right edge (resize width, keep left edge fixed)
      if (handleKey === "RR") {
        const newWidth = widthCandles + dIndex;
        if (newWidth < 5) return obj;
        return { ...obj, widthCandles: newWidth };
      }
      // body drag: move all prices + horizontal position together
      return {
        ...obj,
        entry: obj.entry + dPrice,
        sl:    obj.sl    + dPrice,
        tp:    obj.tp    + dPrice,
        startAbsIndex: startAbsIndex + dIndex,
      };
    }
    case "path": {
      if (!obj.points) return obj;
      if (typeof handleKey === "string" && handleKey.startsWith("point:")) {
        const idx = parseInt(handleKey.slice(6), 10);
        return {
          ...obj,
          points: obj.points.map((p, i) =>
            i === idx ? { absIndex: p.absIndex + dIndex, price: p.price + dPrice } : p
          ),
        };
      }
      // body drag — translate every vertex together
      return {
        ...obj,
        points: obj.points.map(p => ({ absIndex: p.absIndex + dIndex, price: p.price + dPrice })),
      };
    }
    case "text":
      return { ...obj, absIndex: obj.absIndex + dIndex, price: obj.price + dPrice };
    default:
      return obj;
  }
}

// ─── Cursor style resolution ─────────────────────────────────────────────────

export function resolveCursor(activeTool, dragState, hoverHandle, hoverId, posHandle, editingId) {
  if (activeTool !== "select") return "crosshair";
  if (dragState?.type === "object") {
    if (dragState.handleKey === "body") return "grabbing";
    if (dragState.handleKey === "T" || dragState.handleKey === "S" || dragState.handleKey === "E") return "ns-resize";
    if (dragState.handleKey === "RL" || dragState.handleKey === "RR") return "ew-resize";
    if (dragState.handleKey === "line") return "grabbing";
    return _resizeCursor(dragState.handleKey);
  }
  if (dragState) return "grabbing";
  if (posHandle) return "ns-resize";
  // Position objects: show appropriate cursors per handle
  if (hoverId) {
    if (hoverHandle === "T" || hoverHandle === "S" || hoverHandle === "E") return "ns-resize";
    if (hoverHandle === "RL" || hoverHandle === "RR") return "ew-resize";
    if (hoverHandle === "body") return "grab";
    if (hoverHandle && hoverHandle !== "line") return _resizeCursor(hoverHandle);
    return "pointer";
  }
  return "default";
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function _resizeCursor(handleKey) {
  if (handleKey === "p3" || handleKey === "p4") return "nesw-resize";
  return "nwse-resize";
}

function pointNearSegment(px, py, x1, y1, x2, y2, tol) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(px, py, x1, y1) < tol;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * dx, y1 + t * dy) < tol;
}

export function canvasToChart(canvasX, canvasY, transform) {
  const { yToPrice, xToAbs } = transform;
  return {
    price: yToPrice(canvasY),
    absIndex: xToAbs(canvasX),
  };
}
