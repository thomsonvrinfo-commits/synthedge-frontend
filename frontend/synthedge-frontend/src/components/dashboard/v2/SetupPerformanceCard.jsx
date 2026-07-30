import React from "react";
import { cn } from "@/lib/utils";

export default function SetupPerformanceCard({ setupMap = {} }) {
  const entries = Object.entries(setupMap)
    .map(([name, s]) => ({
      name,
      total: s.total,
      winRate: parseFloat(((s.wins / s.total) * 100).toFixed(1)),
      pl: parseFloat(s.pl?.toFixed(2) || 0),
      avgRR: s.rrs?.length ? parseFloat((s.rrs.reduce((a, b) => a + b, 0) / s.rrs.length).toFixed(1)) : null,
    }))
    .sort((a, b) => b.winRate - a.winRate);

  if (!entries.length) {
    return (
      <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5">
        <h3 className="text-sm font-semibold mb-3">Setup Performance</h3>
        <p className="text-xs text-muted-foreground">Tag your trades with strategies to track setup performance.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Setup Performance</h3>
      {/* Header */}
      <div className="grid grid-cols-5 gap-1 px-1 pb-1 border-b border-border/50">
        {["Setup", "Win Rate", "Avg RR", "Net P/L", "Trades"].map(h => (
          <span key={h} className="text-[10px] text-muted-foreground font-medium">{h}</span>
        ))}
      </div>
      <div className="space-y-0.5">
        {entries.map(s => (
          <div key={s.name} className="grid grid-cols-5 gap-1 px-1 py-1.5 rounded-lg hover:bg-secondary/40 transition-colors items-center">
            <span className="text-xs font-medium truncate">{s.name}</span>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full", s.winRate >= 60 ? "bg-emerald-500" : s.winRate >= 45 ? "bg-warning" : "bg-destructive")}
                  style={{ width: `${s.winRate}%` }}
                />
              </div>
              <span className={cn("text-[10px] font-mono w-8 flex-shrink-0", s.winRate >= 60 ? "text-emerald-500" : s.winRate >= 45 ? "text-warning" : "text-destructive")}>
                {s.winRate}%
              </span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">{s.avgRR ?? "—"}</span>
            <span className={cn("text-[10px] font-mono font-semibold", s.pl >= 0 ? "text-emerald-500" : "text-destructive")}>
              {s.pl >= 0 ? "+" : ""}${s.pl}
            </span>
            <span className="text-[10px] text-muted-foreground">{s.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}