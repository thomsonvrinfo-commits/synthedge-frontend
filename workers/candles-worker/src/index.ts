// SynthEdge Candles Worker.
//
// Serves historical OHLC candle data for Deriv Synthetic Indices out of R2.
// Authentication + subscription enforcement + CORS-safe error handling.

import type { Env } from "@synthedge/shared";
import {
  extractBearerToken,
  verifyAccessToken,
  resolveSubscription,
} from "@synthedge/shared";
import { parquetReadObjects } from "hyparquet";

const VERSION = "SYNTHEDGE_WORKER_V4_CORS_AUTH_FIXED";

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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function corsError(message: string, status = 500, extra?: unknown): Response {
  const body: Record<string, unknown> = {
    error: message,
  };

  if (extra !== undefined) {
    body.detail = String(extra);
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
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

  if (!folder) {
    throw new Error(`No R2 folder configured for symbol: ${symbol}`);
  }

  const candles: RawCandle[] = [];

  const start = new Date(fromEpoch * 1000);
  const end = new Date(toEpoch * 1000);

  let current = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      1
    )
  );

  while (current <= end) {
    const month = current.toISOString().slice(0, 7);
    const key = `${folder}/m1/${month}.parquet`;

    console.log("R2 LOAD:", key);

    const file = await env.BUCKET.get(key);

    if (file) {
      const buffer = await file.arrayBuffer();

      const rows = await parquetReadObjects({
        file: buffer,
      });

      candles.push(
        ...rows.map((row: any) => ({
          timestamp:
            row.timestamp instanceof Date
              ? Math.floor(row.timestamp.getTime() / 1000)
              : Number(row.timestamp),

          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),

          // Support both possible parquet column names.
          volume:
            row.tick_volume !== undefined
              ? Number(row.tick_volume)
              : row.volume !== undefined
                ? Number(row.volume)
                : 0,
        }))
      );
    }

    current.setUTCMonth(current.getUTCMonth() + 1);
  }

  return candles
    .filter(
      (c) =>
        Number.isFinite(c.timestamp) &&
        c.timestamp >= fromEpoch &&
        c.timestamp <= toEpoch
    )
    .sort((a, b) => a.timestamp - b.timestamp);
}

function aggregateCandles(
  candles: RawCandle[],
  seconds: number
): RawCandle[] {
  const groups: Record<number, RawCandle> = {};

  for (const candle of candles) {
    const bucket =
      Math.floor(candle.timestamp / seconds) * seconds;

    const existing = groups[bucket];

    if (!existing) {
      groups[bucket] = {
        timestamp: bucket,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      };
    } else {
      existing.high = Math.max(
        existing.high,
        candle.high
      );

      existing.low = Math.min(
        existing.low,
        candle.low
      );

      existing.close = candle.close;
      existing.volume += candle.volume;
    }
  }

  return Object.values(groups).sort(
    (a, b) => a.timestamp - b.timestamp
  );
}

async function handleCandles(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  /*
   * ============================================================
   * AUTHENTICATION
   * ============================================================
   */

  const token = extractBearerToken(request);

  if (!token) {
    console.error("CANDLES AUTH: Missing Bearer token");
    return corsError("Unauthorized", 401);
  }

  let verified;

  try {
    verified = await verifyAccessToken(
      token,
      env.JWT_SECRET
    );
  } catch (error) {
    console.error(
      "CANDLES AUTH: JWT verification failed:",
      error
    );

    return corsError(
      "Unauthorized",
      401,
      error
    );
  }

  if (!verified.valid || !verified.payload) {
    console.error(
      "CANDLES AUTH: Invalid JWT"
    );

    return corsError("Unauthorized", 401);
  }

  const userId = verified.payload.sub;
  const role = verified.payload.role;

  console.log(
    "CANDLES AUTH OK:",
    userId,
    role
  );

  /*
   * ============================================================
   * SUBSCRIPTION
   * ============================================================
   */

  let subscription;

  try {
    subscription = await resolveSubscription(
      env,
      userId,
      role
    );
  } catch (error) {
    console.error(
      "SUBSCRIPTION RESOLUTION FAILED:",
      error
    );

    return corsError(
      "Failed to resolve subscription",
      500,
      error
    );
  }

  const premium = subscription.hasFullAccess;

  /*
   * ============================================================
   * REQUEST VALIDATION
   * ============================================================
   */

  const symbol =
    url.searchParams.get("symbol");

  const timeframe =
    (
      url.searchParams.get("timeframe") ||
      "M1"
    ).toUpperCase();

  console.log(
    "CANDLES REQUEST:",
    {
      symbol,
      timeframe,
      premium,
    }
  );

  if (
    !symbol ||
    !ALLOWED_SYMBOLS.has(symbol)
  ) {
    return json(
      {
        error: "Invalid symbol",
        symbol,
      },
      400
    );
  }

  if (!TIMEFRAMES[timeframe]) {
    return json(
      {
        error: "Invalid timeframe",
        timeframe,
      },
      400
    );
  }

  const timeframeSeconds =
    TIMEFRAMES[timeframe];

  /*
   * ============================================================
   * DATE RANGE
   * ============================================================
   */

  let fromEpoch: number;
  let toEpoch: number;

  if (premium) {
    /*
     * Premium / Trial / Admin
     *
     * Custom historical ranges are allowed.
     */

    const fromParam =
      url.searchParams.get("from");

    const toParam =
      url.searchParams.get("to");

    const requestedFrom =
      fromParam === null
        ? NaN
        : Number(fromParam);

    const requestedTo =
      toParam === null
        ? NaN
        : Number(toParam);

    if (
      !Number.isFinite(requestedFrom) ||
      !Number.isFinite(requestedTo)
    ) {
      return json(
        {
          error:
            "from and to (unix seconds) are required for custom date-range requests",
        },
        400
      );
    }

    if (requestedFrom >= requestedTo) {
      return json(
        {
          error:
            "from must be earlier than to",
        },
        400
      );
    }

    fromEpoch = requestedFrom;
    toEpoch = requestedTo;
  } else {
    /*
     * FREE USERS
     *
     * Ignore requested from/to completely.
     * Always serve the latest 1,000 candles.
     */

    toEpoch = Math.floor(
      Date.now() / 1000
    );

    fromEpoch =
      toEpoch -
      FREE_PLAN_CANDLE_LIMIT *
        timeframeSeconds *
        2;
  }

  /*
   * ============================================================
   * LOAD + AGGREGATE
   * ============================================================
   */

  try {
    console.log(
      "LOADING HISTORICAL:",
      {
        symbol,
        timeframe,
        from: fromEpoch,
        to: toEpoch,
      }
    );

    let candles = await loadCandles(
      env,
      symbol,
      fromEpoch,
      toEpoch
    );

    console.log(
      "M1 CANDLES LOADED:",
      candles.length
    );

    if (timeframe !== "M1") {
      candles = aggregateCandles(
        candles,
        timeframeSeconds
      );

      console.log(
        "AGGREGATED CANDLES:",
        candles.length
      );
    }

    /*
     * ============================================================
     * FREE PLAN HARD LIMIT
     * ============================================================
     */

    if (!premium) {
      candles = candles.slice(
        -FREE_PLAN_CANDLE_LIMIT
      );
    }

    console.log(
      "CANDLES RETURNING:",
      candles.length
    );

    return json({
      version: VERSION,
      symbol,
      timeframe,
      plan: subscription.tier,
      restricted: !premium,
      count: candles.length,
      candles,
    });
  } catch (error) {
    console.error(
      "CANDLES LOAD FAILED:",
      error
    );

    return corsError(
      "worker error",
      500,
      error
    );
  }
}

/*
 * ================================================================
 * WORKER ENTRY
 * ================================================================
 */

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const url = new URL(
      request.url
    );

    /*
     * CORS preflight
     */

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    /*
     * Health check
     */

    if (
      url.pathname === "/" ||
      url.pathname === "/health"
    ) {
      return json({
        status:
          "SynthEdge candles API online",
        version: VERSION,
      });
    }

    /*
     * Only /candles is exposed.
     */

    if (
      url.pathname !== "/candles"
    ) {
      return corsError(
        `Not found: ${url.pathname}`,
        404
      );
    }

    /*
     * Only GET is supported.
     */

    if (
      request.method !== "GET"
    ) {
      return corsError(
        "Method not allowed",
        405
      );
    }

    /*
     * Final safety net:
     * absolutely every unexpected Worker
     * exception gets CORS headers.
     */

    try {
      return await handleCandles(
        request,
        env,
        url
      );
    } catch (error) {
      console.error(
        "CANDLES WORKER UNHANDLED ERROR:",
        error
      );

      return corsError(
        "Internal candles worker error",
        500,
        error
      );
    }
  },
};
