import React, { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";
import { format, subDays, isAfter } from "date-fns";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeEquityCurve } from "@/lib/analyticsEngine";

const PERIODS = ["7D", "30D", "90D", "ALL"];

function buildData(trades, period) {
  // Use trade_date (execution date) for all filtering — NOT created_date (DB timestamp)
  const sorted = [...trades]
    .filter(t => (t.trade_date || t.createdAt) && (t.pl != null || t.rr != null))
    .sort((a, b) => new Date(a.trade_date || a.createdAt) - new Date(b.trade_date || b.createdAt));

  let filtered = sorted;
  if (period !== "ALL") {
    const days = period === "7D" ? 7 : period === "30D" ? 30 : 90;
    const cutoff = subDays(new Date(), days);
    filtered = sorted.filter(t => isAfter(new Date(t.trade_date || t.createdAt), cutoff));
  }

  return computeEquityCurve(filtered).map(d => ({
    date: format(new Date(d.date), "MMM d"),
    equity: d.equity,
    dailyPL: parseFloat((d.dailyPL ?? d.dailyRR ?? 0).toFixed(2)),
    trades: d.count,
  }));
}

function computeMaxDrawdown(data) {
  let peak = 0, maxDD = 0;
  data.forEach(d => {
    if (d.equity > peak) peak = d.equity;
    const dd = peak - d.equity;
    if (dd > maxDD) maxDD = dd;
  });
  return maxDD;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border/80 rounded-xl shadow-xl p-3 text-xs">
      <p className="font-semibold mb-1">{label}</p>
      <p className="text-muted-foreground">Equity: <span className={cn("font-mono font-bold", d.equity >= 0 ? "text-emerald-500" : "text-destructive")}>${d.equity.toFixed(2)}</span></p>
      <p className="text-muted-foreground">Daily P/L: <span className={cn("font-mono", d.dailyPL >= 0 ? "text-emerald-500" : "text-destructive")}>{d.dailyPL >= 0 ? "+" : ""}${d.dailyPL.toFixed(2)}</span></p>
      <p className="text-muted-foreground">Trades: {d.trades}</p>
    </div>
  );
};

export default function EquityCurveV2({ trades = [], mode = "live" }) {
  const [period, setPeriod] = useState("30D");

  const data = useMemo(() => buildData(trades, period), [trades, period]);
  const totalPL = data.length ? data[data.length - 1].equity : 0;
  const isPos = totalPL >= 0;
  const maxDD = computeMaxDrawdown(data);

  const prevMonthTrades = useMemo(() => {
    const cutoff = subDays(new Date(), 60);
    const prev30 = subDays(new Date(), 30);
    return trades.filter(t => {
      const ts = t.trade_date || t.createdAt;
      return ts && isAfter(new Date(ts), cutoff) && !isAfter(new Date(ts), prev30);
    });
  }, [trades]);

  const lastMonthData = useMemo(() => buildData(trades, "30D"), [trades]);
  const prevMonthPL = prevMonthTrades.reduce((s, t) => s + (t.pl ?? t.rr ?? 0), 0);
  const currentMonthPL = lastMonthData.length ? lastMonthData[lastMonthData.length - 1].equity : 0;
  const monthPct = prevMonthPL !== 0 ? ((currentMonthPL - prevMonthPL) / Math.abs(prevMonthPL) * 100).toFixed(1) : null;

  const thisMonth = trades.filter(t => {
    const ts = t.trade_date || t.createdAt;
    if (!ts) return false;
    const now = new Date();
    const d = new Date(ts);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthWR = thisMonth.length ? Math.round((thisMonth.filter(t => t.result === "Win").length / thisMonth.length) * 100) : 0;

  if (!data.length) {
    return (
      <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">Equity Curve</h3>
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm text-muted-foreground">Log more trades to visualize your equity growth.</p>
          <div className="w-40 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min((trades.length / 10) * 100, 100)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Current trades: {trades.length}/10</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">Equity Curve</h3>
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <p className={cn("text-2xl font-black mt-1", isPos ? "text-emerald-500" : "text-destructive")}>
            {isPos ? "+" : ""}${Math.abs(totalPL).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">Total Growth</p>
          {monthPct && (
            <p className={cn("text-xs font-semibold", parseFloat(monthPct) >= 0 ? "text-emerald-500" : "text-destructive")}>
              {parseFloat(monthPct) >= 0 ? "↑" : "↓"}
              {Math.abs(parseFloat(monthPct))}% this month
            </p>
          )}
        </div>
        {/* Period selector */}
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn("px-2 py-1 rounded-lg text-xs font-semibold transition-all",
                period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="eqPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="eqNeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(0 72% 51%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(0 72% 51%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={50}
              tickFormatter={v => `$${v}`} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="equity"
              stroke={isPos ? "hsl(142 71% 45%)" : "hsl(0 72% 51%)"}
              fill={isPos ? "url(#eqPos)" : "url(#eqNeg)"}
              strokeWidth={2} dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
            <span className="text-xs">📉</span>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground">Max Drawdown</p>
            <p className="text-xs font-bold text-destructive">-${maxDD.toFixed(2)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-xs">📊</span>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground">Total Trades</p>
            <p className="text-xs font-bold text-primary">{thisMonth.length}</p>
            <p className="text-[9px] text-muted-foreground">This month</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <span className="text-xs">🎯</span>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground">Win Rate</p>
            <p className="text-xs font-bold text-purple-500">{thisMonthWR}%</p>
            <p className="text-[9px] text-muted-foreground">This month</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>📊 Cumulative P/L from selected dataset</span>
        <span>Values in account currency (USD)</span>
      </div>
    </div>
  );
}