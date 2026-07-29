import React, { useMemo } from "react";
import { listTrades } from "@/api/trades";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Activity, Target, BarChart2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { priceDecimals } from "@/lib/chartEngine";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function ReplayJournal() {
  const { user } = useCurrentUser();
  const { data: trades = [], isLoading } = useQuery({
    queryKey: ["replayTrades", user?.id],
    queryFn: () => listTrades({ dataset: "BACKTEST", limit: 200 }),
    enabled: !!user?.id,
    initialData: [],
  });

  const stats = useMemo(() => {
    if (!trades.length) return null;
    const wins = trades.filter(t => t.result === "Win").length;
    const totalPL = trades.reduce((s, t) => s + (t.profit_loss || 0), 0);
    const avgRR = trades.filter(t => t.risk_reward_ratio).reduce((s, t) => s + t.risk_reward_ratio, 0) / (trades.filter(t => t.risk_reward_ratio).length || 1);
    return { wins, losses: trades.length - wins, winRate: ((wins / trades.length) * 100).toFixed(1), totalPL, avgRR: avgRR.toFixed(2) };
  }, [trades]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Replay Journal</h1>
          <Badge className="bg-primary/20 text-primary border-primary/30 text-xs font-mono">SIM</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Simulated replay trades — isolated from live performance analytics</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Trades", value: trades.length, icon: Activity },
            { label: "Win Rate", value: `${stats.winRate}%`, icon: Target, color: parseFloat(stats.winRate) >= 50 ? "text-success" : "text-destructive" },
            { label: "Wins", value: stats.wins, icon: TrendingUp, color: "text-success" },
            { label: "Losses", value: stats.losses, icon: TrendingDown, color: "text-destructive" },
            { label: "Avg RR", value: stats.avgRR, icon: BarChart2, color: "text-primary" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-3 text-center">
              <p className={cn("text-xl font-bold font-mono", s.color)}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Trades list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading replay trades…</div>
      ) : trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-card border border-border rounded-xl">
          <Activity className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No replay trades yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Complete trades in the Replay Engine to see them here</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_auto] gap-x-4 px-4 py-2.5 border-b border-border text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
            <span>Dir</span><span>Symbol</span><span>Entry</span><span>Exit</span><span>RR</span><span>P/L</span><span>Result</span>
          </div>
          <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
            {trades.map((t, i) => {
              const dec = priceDecimals(t.entry_price);
              return (
                <div key={t.id || i} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_auto] gap-x-4 px-4 py-2.5 items-center hover:bg-secondary/30 transition-colors text-xs">
                  <div className={cn("flex items-center gap-1 font-semibold", t.direction === "Buy" ? "text-success" : "text-destructive")}>
                    {t.direction === "Buy" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {t.direction}
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground truncate">{t.synthetic_index}</span>
                  <span className="font-mono">{t.entry_price?.toFixed(dec)}</span>
                  <span className="font-mono">{t.exit_price?.toFixed(dec) || "—"}</span>
                  <span className="font-mono text-primary">{t.risk_reward_ratio || "—"}</span>
                  <span className={cn("font-mono font-semibold", (t.profit_loss || 0) >= 0 ? "text-success" : "text-destructive")}>
                    {(t.profit_loss || 0) >= 0 ? "+" : ""}{t.profit_loss?.toFixed(5) || "—"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5",
                      t.result === "Win" ? "text-success border-success/30" : "text-destructive border-destructive/30")}>
                      {t.result}
                    </Badge>
                    <Badge className="bg-primary/15 text-primary border-primary/20 text-[9px] px-1 font-mono">SIM</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}