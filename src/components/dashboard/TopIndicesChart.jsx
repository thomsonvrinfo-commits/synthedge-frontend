import React from "react";
import { cn } from "@/lib/utils";

export default function TopIndicesChart({ trades }) {
  if (!trades || trades.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold mb-4">Top Indices</h3>
        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
          No trade data yet
        </div>
      </div>
    );
  }

  const indexMap = {};
  trades.forEach(t => {
    if (!t.synthetic_index) return;
    if (!indexMap[t.synthetic_index]) indexMap[t.synthetic_index] = { count: 0, wins: 0, pl: 0 };
    indexMap[t.synthetic_index].count++;
    if (t.result === "Win") indexMap[t.synthetic_index].wins++;
    indexMap[t.synthetic_index].pl += t.profit_loss || 0;
  });

  const sorted = Object.entries(indexMap)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 5);

  const maxCount = sorted[0]?.[1]?.count || 1;

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h3 className="text-sm font-semibold mb-4">Top Indices</h3>
      <div className="space-y-3">
        {sorted.map(([name, stats]) => {
          const wr = ((stats.wins / stats.count) * 100).toFixed(0);
          return (
            <div key={name}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium truncate">{name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{stats.count} trades</span>
                  <span className={cn(
                    "font-mono font-medium",
                    stats.pl >= 0 ? "text-success" : "text-destructive"
                  )}>
                    {stats.pl >= 0 ? "+" : ""}{stats.pl.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(stats.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}