import React from "react";
import { cn } from "@/lib/utils";

export default function SetupPerformanceTable({ setupMap }) {
  const entries = Object.entries(setupMap || {})
    .map(([name, s]) => ({
      name,
      total: s.total,
      winRate: parseFloat(((s.wins / s.total) * 100).toFixed(1)),
      pl: parseFloat(s.pl.toFixed(2)),
      avgRR: s.rrs?.length ? parseFloat((s.rrs.reduce((a, b) => a + b, 0) / s.rrs.length).toFixed(2)) : null,
    }))
    .sort((a, b) => b.winRate - a.winRate);

  if (!entries.length) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3">Setup Performance</h3>
        <p className="text-xs text-muted-foreground">No strategy data yet. Tag your trades with setups.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-3">Setup Performance</h3>
      <div className="space-y-2">
        {entries.map(s => (
          <div key={s.name} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium truncate">{s.name}</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground">{s.total}T</span>
                  {s.avgRR && <span className="text-[10px] text-primary font-mono">RR {s.avgRR}</span>}
                  <span className={cn("text-xs font-mono font-semibold", s.pl >= 0 ? "text-success" : "text-destructive")}>
                    {s.pl >= 0 ? "+" : ""}{s.pl}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", s.winRate >= 55 ? "bg-success" : s.winRate >= 45 ? "bg-warning" : "bg-destructive")}
                    style={{ width: `${s.winRate}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{s.winRate}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}