// SynthEdge Candles Worker.
//
// Serves historical OHLC candle data for Deriv Synthetic Indices out of R2
// (gzip-compressed JSON, one file per symbol/month — see FOLDER_MAP below).
//
// Milestone: backend subscription enforcement (see SYNTHEDGE-COMPLETION-REPORT.md
// / engineering handoff for context). Before this change, this Worker had:
//   - no authentication at all (any request, anonymous or not, was served)
//   - no subscription check (free and premium users got identical, unlimited
//     custom date-range access)
//   - dead duplicate stub routes (/auth/me, /profile, /trades,
//     /replay-sessions) that shadowed the real, working `entities` Worker
//   - an unauthenticated /debug/r2 route that listed bucket contents
//
// This rewrite:
//   - requires a valid JWT (same access tokens issued by workers/auth,
//     verified with the same JWT_SECRET and the shared `verifyAccessToken`
//     helper also used by workers/entities — no new auth mechanism)
//   - looks up the caller's plan from `trader_profiles` (the same table
//     workers/entities and the frontend's useSubscription() hook already
//     treat as the single source of truth for plan/trial state)
//   - enforces the 1,000-candle / no-custom-range restriction for free
//     users entirely server-side, as a final unconditional clamp on the
//     response — not just by ignoring query params, so it can't be bypassed
//     by a crafted request
//   - removes the dead stub routes and the unauthenticated debug endpoint
//
// Routes:
//   GET /health   — liveness check, no auth
//   GET /candles  — auth required; ?symbol=&timeframe=&from=&to=
//                   (from/to are honored only for premium/trial-active/admin
//                   callers; free callers always get the latest 1,000
//                   candles for the requested symbol/timeframe)

import type { Env } from "@synthedge/shared";
import { extractBearerToken, verifyAccessToken, jsonError, resolveSubscription } from "@synthedge/shared";
import { parquetReadObjects } from "hyparquet";

const VERSION = "SYNTHEDGE_WORKER_V3_SUBSCRIPTION_ENFORCED";

const ALLOWED_SYMBOLS = new Set([
  "Volatility 10 Index",
  "Volatility 50 Index",
  "Volatility 75 Index",
  "Volatility 100 Index",
]);

const TIMEFRAMES: Record<string, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
};

const FOLDER_MAP: Record<string, string> = {
  "Volatility 10 Index": "volatility-10",
  "Volatility 50 Index": "volatility-50",
  "Volatility 75 Index": "volatility-75",
  "Volatility 100 Index": "volatility-100",
};

const FREE_PLAN_CANDLE_LIMIT = 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

interface RawCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function loadCandles(
  env: Env,
  symbol: string,
  fromEpoch: number,
  toEpoch: number
): Promise<RawCandle[]> {
  const folder = FOLDER_MAP[symbol];
  let candles: RawCandle[] = [];

  const start = new Date(fromEpoch * 1000);
  const end = new Date(toEpoch * 1000);
  let current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));

  while (current <= end) {
    const month = current.toISOString().slice(0, 7);
    const key = `${folder}/m1/${month}.parquet`;
    const file = await env.BUCKET!.get(key);

    if (file) {
  const buffer = await file.arrayBuffer();

  const rows = await parquetReadObjects({
    file: buffer,
  });

  candles.push(
    ...rows.map((row) => ({
      timestamp:
  row.timestamp instanceof Date
    ? Math.floor(row.timestamp.getTime() / 1000)
    : Number(row.timestamp),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.tick_volume),
    }))
  );
}

    current.setUTCMonth(current.getUTCMonth() + 1);
  }

  return candles.filter((c) => c.timestamp >= fromEpoch && c.timestamp <= toEpoch);
}

function aggregateCandles(candles: RawCandle[], seconds: number): RawCandle[] {
  const groups: Record<number, RawCandle> = {};

  for (const c of candles) {
    const bucket = Math.floor(c.timestamp / seconds) * seconds;
    const g = groups[bucket];
    if (!g) {
      groups[bucket] = { timestamp: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    } else {
      g.high = Math.max(g.high, c.high);
      g.low = Math.min(g.low, c.low);
      g.close = c.close;
      g.volume += c.volume;
    }
  }

  return Object.values(groups).sort((a, b) => a.timestamp - b.timestamp);
}


async function handleCandles(request: Request, env: Env, url: URL): Promise<Response> {
  // --- Auth: every /candles request must carry a valid access token. ---
  const token = extractBearerToken(request);
  if (!token) return jsonError("Unauthorized", 401);

  const verified = await verifyAccessToken(token, env.JWT_SECRET);
  if (!verified.valid || !verified.payload) return jsonError("Unauthorized", 401);

  const userId = verified.payload.sub;
  const role = verified.payload.role;

  // --- Centralized subscription check (Milestone 2): the single source of
  // truth for free/trial/premium, shared by every Worker. This Worker no
  // longer decides plan logic on its own. ---
  const subscription = await resolveSubscription(env, userId, role);
  const premium = subscription.hasFullAccess;

  // --- Symbol / timeframe validation (unchanged from before). ---
  const symbol = url.searchParams.get("symbol");
  const timeframe = (url.searchParams.get("timeframe") || "M1").toUpperCase();

  if (!symbol || !ALLOWED_SYMBOLS.has(symbol)) {
    return json({ error: "Invalid symbol", symbol }, 400);
  }
  if (!TIMEFRAMES[timeframe]) {
    return json({ error: "Invalid timeframe" }, 400);
  }
  const timeframeSeconds = TIMEFRAMES[timeframe] as number;

  let fromEpoch: number;
  let toEpoch: number;

  if (premium) {
    // Premium/trial-active/admin: honor the caller's requested date range.
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const requestedFrom = fromParam === null ? NaN : Number(fromParam);
    const requestedTo = toParam === null ? NaN : Number(toParam);
    if (!Number.isFinite(requestedFrom) || !Number.isFinite(requestedTo)) {
      return json({ error: "from and to (unix seconds) are required for custom date-range requests" }, 400);
    }
    fromEpoch = requestedFrom;
    toEpoch = requestedTo;
  } else {
    // Free tier: ANY requested from/to is ignored outright. We always
    // compute our own "latest 1,000 candles" window server-side, so a
    // crafted request (e.g. an old `from`) cannot pull historical data.
    toEpoch = Math.floor(Date.now() / 1000);
    // Generous span to guarantee >= 1,000 aggregated candles even across
    // data gaps; the hard clamp below is what actually enforces the limit.
    fromEpoch = toEpoch - FREE_PLAN_CANDLE_LIMIT * timeframeSeconds * 2;
  }

  try {
    let candles = await loadCandles(env, symbol, fromEpoch, toEpoch);

    if (timeframe !== "M1") {
      candles = aggregateCandles(candles, timeframeSeconds);
    }

    if (!premium) {
      // Final, unconditional clamp — enforced regardless of anything above,
      // so this can never regress into serving more than the free limit.
      candles = candles.slice(-FREE_PLAN_CANDLE_LIMIT);
    }

    return json({
      version: VERSION,
      symbol,
      timeframe,
      plan: subscription.tier,
      restricted: !premium,
      count: candles.length,
      candles,
    });
  } catch (e) {
    return json({ error: "worker error", detail: String(e) }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ status: "SynthEdge candles API online", version: VERSION });
    }

    if (url.pathname !== "/candles") {
      return json({ error: "Not found", path: url.pathname }, 404);
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    return handleCandles(request, env, url);
  },
};
