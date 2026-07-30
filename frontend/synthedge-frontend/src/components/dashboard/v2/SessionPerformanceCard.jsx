import React from "react";
import { cn } from "@/lib/utils";

const SESSIONS = ["London", "New York", "Asian", "Sydney", "Overlap"];

export default function SessionPerformanceCard({ sessionMap = {} }) {
  const entries = SESSIONS.map(session => {
    const s = sessionMap[session];
    if (!s) return { session, noData: true };
    return {
      session,
      total: s.total,
      winRate: ((s.wins / s.total) * 100).toFixed(0),
      pl: s.pl.toFixed(2),
      isPos: s.pl >= 0,
      avgRR: s.rrs?.length ? (s.rrs.reduce((a, b) => a + b, 0) / s.rrs.length).toFixed(1) : null,
    };
  });

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Session Performance</h3>
      <div className="space-y-0.5">
        {/* Header */}
        <div className="grid grid-cols-5 gap-2 px-2 pb-1.5">
          {["Session", "Win Rate", "Avg RR", "Net P/L", "Trades"].map(h => (
            <span key={h} className="text-[10px] text-muted-foreground font-medium">{h}</span>
          ))}
        </div>
        {entries.map(e => (
          <div
            key={e.session}
            className={cn(
              "grid grid-cols-5 gap-2 px-2 py-2 rounded-lg text-xs",
              !e.noData ? "hover:bg-secondary/40 transition-colors" : "opacity-40"
            )}
          >
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                e.noData ? "bg-border" : e.isPos ? "bg-emerald-500" : "bg-destructive"
              )} />
              <span className="font-medium text-[11px] truncate">{e.session}</span>
            </div>
            <span className={cn("font-mono text-[11px]", e.noData ? "text-muted-foreground" : e.isPos ? "text-emerald-500" : "text-destructive")}>
              {e.noData ? "—" : `${e.winRate}%`}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {e.noData ? "—" : e.avgRR ? e.avgRR : "—"}
            </span>
            <span className={cn("font-mono text-[11px] font-semibold", e.noData ? "text-muted-foreground" : e.isPos ? "text-emerald-500" : "text-destructive")}>
              {e.noData ? "No trades" : `${e.isPos ? "+" : ""}$${e.pl}`}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {e.noData ? "—" : e.total}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}