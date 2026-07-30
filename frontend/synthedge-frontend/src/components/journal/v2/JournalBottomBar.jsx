import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

function MiniBarChart({ data = [] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(Math.abs), 1);
  return (
    <div className="flex items-end gap-0.5 h-5">
      {data.map((v, i) => (
        <div key={i} className={cn("w-1.5 rounded-sm flex-shrink-0", v >= 0 ? "bg-emerald-500/60" : "bg-destructive/60")}
          style={{ height: `${(Math.abs(v) / max) * 100}%`, minHeight: 2 }} />
      ))}
    </div>
  );
}

function MiniSparkline({ data = [], color = "#22c55e", className = "" }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 50, H = 20;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`).join(" ");
  return <svg width={W} height={H} className={className}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}

export default function JournalBottomBar({ trades }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = trades.filter(t => t.trade_date?.slice(0, 10) === today);
  const todayPL = todayTrades.reduce((s, t) => s + (t.profit_loss || 0), 0);

  const last7 = useMemo(() => {
    const map = {};
    trades.forEach(t => {
      if (!t.trade_date) return;
      const d = t.trade_date.slice(0, 10);
      map[d] = (map[d] || 0) + (t.profit_loss || 0);
    });
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).slice(-7).map(([,v]) => v);
  }, [trades]);

  const bestTrade = trades.reduce((best, t) => (t.profit_loss || 0) > (best?.profit_loss || -Infinity) ? t : best, null);
  const worstTrade = trades.reduce((worst, t) => (t.profit_loss || 0) < (worst?.profit_loss || Infinity) ? t : worst, null);

  const setupMap = {};
  trades.forEach(t => { if (t.strategy) { setupMap[t.strategy] = (setupMap[t.strategy] || 0) + 1; } });
  const mostTraded = Object.entries(setupMap).sort(([,a],[,b]) => b-a)[0];
  const mostTradedWR = mostTraded ? (() => {
    const st = trades.filter(t => t.strategy === mostTraded[0]);
    const w = st.filter(t => t.result === "Win").length;
    return Math.round((w / st.length) * 100);
  })() : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 bg-card border border-border/60 rounded-2xl mt-2">
      <div>
        <p className="text-[10px] text-muted-foreground">Today's P/L</p>
        <p className={cn("text-sm font-black font-mono", todayPL >= 0 ? "text-emerald-500" : "text-destructive")}>
          {todayPL >= 0 ? "+" : ""}${todayPL.toFixed(2)}
        </p>
        <MiniSparkline data={last7} color={todayPL >= 0 ? "#22c55e" : "#ef4444"} />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">Today's Trades</p>
        <p className="text-sm font-black text-primary">{todayTrades.length}</p>
        <MiniBarChart data={todayTrades.map(t => t.profit_loss || 0)} />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">Best Trade</p>
        {bestTrade ? (
          <>
            <p className="text-sm font-black text-emerald-500">+${Math.max(0, bestTrade.profit_loss || 0).toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">{bestTrade.risk_reward_ratio}R</p>
          </>
        ) : <p className="text-sm text-muted-foreground">—</p>}
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">Worst Trade</p>
        {worstTrade && worstTrade.profit_loss < 0 ? (
          <>
            <p className="text-sm font-black text-destructive">${worstTrade.profit_loss.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">{worstTrade.risk_reward_ratio}R</p>
          </>
        ) : <p className="text-sm text-muted-foreground">—</p>}
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">Most Traded Setup</p>
        {mostTraded ? (
          <>
            <p className="text-sm font-black text-primary">{mostTraded[0]}</p>
            <p className="text-[10px] text-muted-foreground">{mostTradedWR}% Win Rate</p>
          </>
        ) : <p className="text-sm text-muted-foreground">—</p>}
      </div>
    </div>
  );
}