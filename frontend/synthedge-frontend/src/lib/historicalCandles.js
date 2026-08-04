import { fetchDerivCandles, SYMBOL_MAP } from "@/lib/derivWebSocket";
import { getAuthToken } from "@/api/client";

const WORKER_BASE_URL = "https://synthedge-candles-api.thomsonvr-info.workers.dev";

const SECONDS_TO_TIMEFRAME = {
  60: "M1",
  300: "M5",
  900: "M15",
  1800: "M30",
  3600: "H1",
  14400: "H4",
  86400: "D1",
};

const MERGE_GAP_TOLERANCE_SECONDS = 3600;

const INDEX_NAME_TO_D1_SYMBOL = {
  "Volatility 10": "Volatility 10 Index",
  "Volatility 50": "Volatility 50 Index",
  "Volatility 75": "Volatility 75 Index",
  "Volatility 100": "Volatility 100 Index",
  "Volatility 100 (1s)": "Volatility 100 (1s) Index",
  "Volatility 10 Index": "Volatility 10 Index",
  "Volatility 50 Index": "Volatility 50 Index",
  "Volatility 75 Index": "Volatility 75 Index",
  "Volatility 100 Index": "Volatility 100 Index",
  "Volatility 100 (1s) Index": "Volatility 100 (1s) Index",
};

async function fetchWorkerCandles(indexName, granularitySeconds, fromEpoch, toEpoch) {
  console.log("INPUT TO HISTORICAL:", indexName);
  const timeframe = SECONDS_TO_TIMEFRAME[granularitySeconds];
  if (!timeframe) {
    throw new Error(`Unsupported granularity for historical data: ${granularitySeconds}s`);
  }

  const d1Symbol = INDEX_NAME_TO_D1_SYMBOL[indexName];
  console.log("D1 SYMBOL OUTPUT:", d1Symbol);
  if (!d1Symbol) {
    throw new Error(`No D1 mapping for index: ${indexName}`);
  }

  console.log("INDEX RECEIVED:", indexName);
  console.log("D1 SYMBOL SENT:", d1Symbol);
  console.log("TIMEFRAME:", timeframe);
  console.log("FROM:", fromEpoch);
  console.log("TO:", toEpoch);
  const url = new URL(`${WORKER_BASE_URL}/candles`);
  url.searchParams.set("symbol", d1Symbol);
  url.searchParams.set("timeframe", timeframe);
  url.searchParams.set("from", String(fromEpoch));
  url.searchParams.set("to", String(toEpoch));

  const token = getAuthToken();
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json();

  if (res.status === 401) {
    throw new Error("Not authenticated — please log in again to load historical data.");
  }

  if (!res.ok) {
    throw new Error(data.error || "Failed to load historical candles");
  }

  return data.candles.map(c => ({
    time: new Date(c.timestamp * 1000).toISOString(),
    epoch: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

export async function fetchMergedCandles(indexName, granularitySeconds, fromEpoch, toEpoch) {
  const historical = await fetchWorkerCandles(indexName, granularitySeconds, fromEpoch, toEpoch);

  const lastHistoricalEpoch = historical.length
    ? historical[historical.length - 1].epoch
    : fromEpoch;

  const gapRemaining = toEpoch - lastHistoricalEpoch;

  if (gapRemaining <= MERGE_GAP_TOLERANCE_SECONDS) {
    return historical;
  }

  const symbol = SYMBOL_MAP[indexName];
  if (!symbol) return historical;

 const candlesNeeded = Math.ceil(gapRemaining / granularitySeconds) + 5;

  let recent = [];
  try {
    recent = await fetchDerivCandles(symbol, granularitySeconds, candlesNeeded);
  } catch (err) {
    console.warn("Deriv gap-fill fetch failed, returning historical-only data:", err);
    return historical;
  }

  const recentFiltered = recent.filter(c => c.epoch > lastHistoricalEpoch);

  return [...historical, ...recentFiltered];
}