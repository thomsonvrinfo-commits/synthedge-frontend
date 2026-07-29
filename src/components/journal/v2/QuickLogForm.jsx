import React, { useState, useMemo } from "react";
import { listTrades, createTrade } from "@/api/trades";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useMode } from "@/lib/ModeContext";
import { ChevronDown, Zap } from "lucide-react";
import { DATASETS, SOURCES, toTradeSavePayload } from "@/lib/tradeAdapter";
import { useProAccess } from "@/hooks/useProAccess";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { calculateTradePnL } from "@/lib/symbolSpecs";
import { trackLifecycleEvent } from "@/lib/lifecycleEvents";

const SYMBOLS = [
  // Volatility
  "Volatility 10", "Volatility 25", "Volatility 50", "Volatility 75", "Volatility 100",
  "Volatility 5 Index", "Volatility 15 Index", "Volatility 30 Index", "Volatility 90 Index",
  "Volatility 10 (1s)", "Volatility 25 (1s)", "Volatility 50 (1s)", "Volatility 75 (1s)", "Volatility 100 (1s)",
  "Volatility 5 (1s)", "Volatility 15 (1s)", "Volatility 30 (1s)", "Volatility 90 (1s)",
  "Volatility 150 (1s)", "Volatility 250 (1s)",
  // Jump
  "Jump 10 Index", "Jump 25 Index", "Jump 50 Index", "Jump 75 Index", "Jump 100 Index",
  // Crash
  "Crash 50 Index", "Crash 99 Index", "Crash 100 Index", "Crash 150 Index", "Crash 200 Index",
  "Crash 300", "Crash 500", "Crash 600 Index", "Crash 900 Index", "Crash 1000",
  // Boom
  "Boom 50 Index", "Boom 99 Index", "Boom 100 Index", "Boom 150 Index", "Boom 200 Index",
  "Boom 300", "Boom 500", "Boom 600 Index", "Boom 900 Index", "Boom 1000",
  // Other
  "Step Index", "Range Break 100", "Range Break 200",
  // Forex & Commodities
  "EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD",
];

const SETUPS = ["BOS", "Liquidity Sweep", "Order Block", "FVG", "Trend Continuation", "Reversal", "Other"];

function detectSession(date) {
  const utcHour = date.getUTCHours();
  const utcMin = date.getUTCMinutes();
  const totalMin = utcHour * 60 + utcMin;
  const isLondon = totalMin >= 480 && totalMin < 960;
  const isNY     = totalMin >= 840 && totalMin < 1320;
  if (isLondon && isNY) return "Overlap";
  if (isLondon) return "London";
  if (isNY) return "New York";
  if (totalMin >= 0 && totalMin < 480) return "Asian";
  return "Sydney";
}

function calcResult(direction, entry, exit) {
  const e = parseFloat(entry), x = parseFloat(exit);
  if (isNaN(e) || isNaN(x)) return null;
  if (direction === "Buy") {
    if (x > e) return "Win";
    if (x < e) return "Loss";
    return "Breakeven";
  } else {
    if (x < e) return "Win";
    if (x > e) return "Loss";
    return "Breakeven";
  }
}

function calcRR(direction, entry, exit, sl) {
  const e = parseFloat(entry), x = parseFloat(exit), s = parseFloat(sl);
  if (isNaN(e) || isNaN(s) || s === e) return null;
  const risk = Math.abs(e - s);
  const reward = Math.abs(x - e);
  return risk > 0 ? parseFloat((reward / risk).toFixed(2)) : null;
}

function validateTrade(direction, entry, sl, tp) {
  const errors = [];
  const e = parseFloat(entry), s = parseFloat(sl), t = parseFloat(tp);
  if (direction === "Buy") {
    if (!isNaN(s) && s >= e) errors.push("SL must be below Entry for a Buy trade");
    if (!isNaN(t) && t <= e) errors.push("TP must be above Entry for a Buy trade");
  } else {
    if (!isNaN(s) && s <= e) errors.push("SL must be above Entry for a Sell trade");
    if (!isNaN(t) && t >= e) errors.push("TP must be below Entry for a Sell trade");
  }
  return errors;
}

const FREE_TRADE_LIMIT = 50;

export default function QuickLogForm({ onSaved, onClose }) {
  const { mode } = useMode();
  const { isPro } = useProAccess();
  const { user } = useCurrentUser();
  const { data: existingTrades = [] } = useQuery({
    queryKey: ["trades", "liveCount", user?.id],
    queryFn: () => listTrades({ dataset: "LIVE", limit: 60 }),
    enabled: !!user?.id,
    initialData: [],
    staleTime: 30 * 1000,
  });
  const liveTrades = existingTrades;
  const atFreeLimit = !isPro && liveTrades.length >= FREE_TRADE_LIMIT;

  const [symbol, setSymbol] = useState("Volatility 75");
  const [direction, setDirection] = useState("Buy");
  const [entry, setEntry] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [setup, setSetup] = useState("");
  const [customSetup, setCustomSetup] = useState("");
  const [lotSize, setLotSize] = useState("");
  const [tradeDate, setTradeDate] = useState(() => {
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);

  const result = useMemo(() => calcResult(direction, entry, exitPrice), [direction, entry, exitPrice]);
  const rr = useMemo(() => sl ? calcRR(direction, entry, exitPrice, sl) : null, [direction, entry, exitPrice, sl]);
  const session = useMemo(() => detectSession(new Date(tradeDate)), [tradeDate]);

  const resultColor = result === "Win" ? "text-emerald-400" : result === "Loss" ? "text-red-400" : result === "Breakeven" ? "text-yellow-400" : "text-muted-foreground";

  const handleSave = async () => {
    if (atFreeLimit) {
      setErrors([`You've reached the ${FREE_TRADE_LIMIT} trade limit on the free plan. Upgrade to Pro for unlimited trades.`]);
      return;
    }
    if (!entry || !exitPrice) { setErrors(["Entry Price and Exit Price are required."]); return; }
    const validErrs = validateTrade(direction, entry, sl, tp);
    if (validErrs.length) { setErrors(validErrs); return; }
    setErrors([]);

    const now = new Date(tradeDate);
    const finalSetup = setup === "Other" ? customSetup : setup;
    const volNum = lotSize !== "" ? parseFloat(lotSize) : null;

    // Use the correct per-symbol MT5 formula; pl is null if volume not provided
    const { pl: realPL } = volNum
      ? calculateTradePnL(symbol, entry, exitPrice, direction, volNum)
      : { pl: undefined };

    const tradeRecord = toTradeSavePayload({
      dataset: mode === "backtest" ? DATASETS.BACKTEST : DATASETS.LIVE,
      source: SOURCES.MANUAL,
      symbol,
      direction,
      entry_price: parseFloat(entry),
      exit_price: parseFloat(exitPrice),
      stop_loss: sl ? parseFloat(sl) : undefined,
      take_profit: tp ? parseFloat(tp) : undefined,
      setup: finalSetup || undefined,
      result,
      rr: rr || undefined,
      pl: realPL ?? undefined,
      lot_size: volNum ?? undefined,
      session,
      createdAt: now.toISOString(),
    });

    setSaving(true);
    const saved = await createTrade(tradeRecord);
    setSaving(false);
    trackLifecycleEvent("TRADE_CREATED");
    onSaved(saved);
  };

  const canSave = entry && exitPrice;

  return (
    <div className="space-y-5">
      {/* Free limit banner */}
      {!isPro && liveTrades.length >= 40 && (
        <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-xs text-warning font-medium">
          {liveTrades.length}/{FREE_TRADE_LIMIT} trades used on the free plan.{" "}
          <Link to="/pricing" className="underline">Upgrade to Pro</Link> for unlimited trades.
        </div>
      )}

      {/* Symbol */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Symbol</label>
        <div className="relative">
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            className="w-full h-10 bg-secondary border border-border/60 rounded-xl px-3 pr-8 text-sm appearance-none focus:outline-none focus:border-primary/60 transition-colors"
          >
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Direction */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Direction</label>
        <div className="flex gap-2">
          {["Buy", "Sell"].map(d => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border",
                direction === d && d === "Buy" ? "bg-emerald-500/15 border-emerald-500 text-emerald-400" :
                direction === d && d === "Sell" ? "bg-red-500/15 border-red-500 text-red-400" :
                "bg-secondary border-border/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {d === "Buy" ? "▲ BUY" : "▼ SELL"}
            </button>
          ))}
        </div>
      </div>

      {/* Price Inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Entry Price <span className="text-red-400">*</span></label>
          <input type="number" step="any" value={entry} onChange={e => setEntry(e.target.value)} placeholder="0.00000"
            className="w-full h-10 bg-secondary border border-border/60 rounded-xl px-3 text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Exit Price <span className="text-red-400">*</span></label>
          <input type="number" step="any" value={exitPrice} onChange={e => setExitPrice(e.target.value)} placeholder="0.00000"
            className="w-full h-10 bg-secondary border border-border/60 rounded-xl px-3 text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stop Loss</label>
          <input type="number" step="any" value={sl} onChange={e => setSl(e.target.value)} placeholder="Optional"
            className="w-full h-10 bg-secondary border border-border/60 rounded-xl px-3 text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Take Profit</label>
          <input type="number" step="any" value={tp} onChange={e => setTp(e.target.value)} placeholder="Optional"
            className="w-full h-10 bg-secondary border border-border/60 rounded-xl px-3 text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Volume (Lots)</label>
          <input type="number" step="any" min="0" value={lotSize} onChange={e => setLotSize(e.target.value)} placeholder="e.g. 1.00"
            className="w-full h-10 bg-secondary border border-border/60 rounded-xl px-3 text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors" />
        </div>
      </div>

      {/* Setup */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Setup</label>
        <div className="flex flex-wrap gap-2">
          {SETUPS.map(s => (
            <button key={s} onClick={() => setSetup(setup === s ? "" : s)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                setup === s ? "bg-primary/15 border-primary text-primary" : "bg-secondary border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
              )}>
              {s}
            </button>
          ))}
        </div>
        {setup === "Other" && (
          <input value={customSetup} onChange={e => setCustomSetup(e.target.value)} placeholder="Describe your setup..."
            className="w-full h-9 bg-secondary border border-border/60 rounded-xl px-3 text-sm focus:outline-none focus:border-primary/60 transition-colors mt-2" />
        )}
      </div>

      {/* Trade Date/Time */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trade Date & Time</label>
        <input type="datetime-local" value={tradeDate} onChange={e => setTradeDate(e.target.value)}
          className="w-full h-10 bg-secondary border border-border/60 rounded-xl px-3 text-sm focus:outline-none focus:border-primary/60 transition-colors" />
      </div>

      {/* Live Summary Card */}
      {(result || rr || session) && (
        <div className="flex items-center gap-4 bg-secondary/60 border border-border/60 rounded-xl px-4 py-3">
          {result && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Result:</span>
              <span className={cn("text-sm font-bold", resultColor)}>
                {result === "Win" ? "WIN ✓" : result === "Loss" ? "LOSS ✗" : "BREAKEVEN ~"}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">RR:</span>
            <span className="text-sm font-bold font-mono text-primary">
              {rr !== null ? `${rr}R` : "—"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Session:</span>
            <span className="text-sm font-semibold">{session}</span>
          </div>
        </div>
      )}

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{e}</p>
          ))}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={!canSave || saving}
        className={cn(
          "w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
          canSave && !saving ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-secondary text-muted-foreground cursor-not-allowed"
        )}
      >
        <Zap className="w-4 h-4" />
        {saving ? "Saving…" : "Save Trade"}
      </button>
    </div>
  );
}
