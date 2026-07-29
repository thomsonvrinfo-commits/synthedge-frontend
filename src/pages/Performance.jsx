import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listConnections, listBrokerTrades } from "@/api/broker";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import { Trophy, TrendingDown, Activity } from "lucide-react";
import { Link } from "react-router-dom";

export default function Performance() {
  const { user } = useCurrentUser();

  const { data: connections = [] } = useQuery({
    queryKey: ["brokerConnections", user?.id],
    queryFn: () => listConnections(),
    enabled: !!user?.id,
    initialData: [],
  });
  const { data: trades = [] } = useQuery({
    queryKey: ["brokerTrades", user?.id],
    queryFn: () => listBrokerTrades({ limit: 1000 }),
    enabled: !!user?.id,
    initialData: [],
  });

  const bySymbol = useMemo(() => {
    const map = {};
    for (const t of trades) {
      const s = t.symbol || "UNKNOWN";
      if (!map[s]) map[s] = { symbol: s, pnl: 0, count: 0 };
      map[s].pnl += Number(t.pnl || 0);
      map[s].count++;
    }
    return Object.values(map).sort((a, b) => b.pnl - a.pnl);
  }, [trades]);

  const best = bySymbol.filter(s => s.pnl > 0).slice(0, 5);
  const worst = bySymbol.filter(s => s.pnl < 0).sort((a, b) => a.pnl - b.pnl).slice(0, 5);

  const statsFor = (list) => {
    const wins = list.filter(t => t.result === "win").length;
    const winRate = list.length ? Math.round((wins / list.length) * 100) : 0;
    const rs = list.map(t => t.r_multiple).filter(v => v != null && !isNaN(v));
    const avgR = rs.length ? (rs.reduce((s, v) => s + v, 0) / rs.length).toFixed(2) : "—";
    return { winRate, avgR, count: list.length };
  };
  const live = statsFor(trades.filter(t => t.account_type === "live"));
  const demo = statsFor(trades.filter(t => t.account_type === "demo"));

  if (!connections.length) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-black">Performance</h1>
        <div className="flex flex-col items-center justify-center h-48 text-center bg-card border border-border/60 rounded-2xl">
          <Activity className="w-8 h-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            Connect a broker account in <Link to="/settings" className="text-primary underline">Settings</Link> to see performance.
          </p>
        </div>
      </div>
    );
  }

  if (!trades.length) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-black">Performance</h1>
        <div className="flex flex-col items-center justify-center h-48 text-center bg-card border border-border/60 rounded-2xl">
          <p className="text-sm text-muted-foreground">Your next trade will appear here automatically.</p>
        </div>
      </div>
    );
  }

  const StatPair = ({ label, live, demo }) => (
    <div className="bg-card border border-border/60 rounded-2xl p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Live</p>
          <p className="text-xl font-bold">{live}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Demo</p>
          <p className="text-xl font-bold">{demo}</p>
        </div>
      </div>
    </div>
  );

  const SymbolRow = ({ s, tone }) => (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-sm font-medium truncate">{s.symbol}</span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{s.count} trades</span>
        <span className={cn("text-sm font-mono font-semibold", tone)}>
          {s.pnl >= 0 ? "+" : ""}{s.pnl.toFixed(2)}
        </span>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <h1 className="text-2xl font-black">Performance</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatPair label="Win Rate" live={live.winRate + "%"} demo={demo.winRate + "%"} />
        <StatPair label="Avg R Multiple" live={live.avgR} demo={demo.avgR} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border/60 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-success" />
            <h3 className="font-bold text-sm">Best Symbols</h3>
          </div>
          {best.length ? best.map(s => <SymbolRow key={s.symbol} s={s} tone="text-success" />) : <p className="text-xs text-muted-foreground py-4">No profitable symbols yet.</p>}
        </div>
        <div className="bg-card border border-border/60 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-destructive" />
            <h3 className="font-bold text-sm">Worst Symbols</h3>
          </div>
          {worst.length ? worst.map(s => <SymbolRow key={s.symbol} s={s} tone="text-destructive" />) : <p className="text-xs text-muted-foreground py-4">No losing symbols yet.</p>}
        </div>
      </div>
    </div>
  );
}