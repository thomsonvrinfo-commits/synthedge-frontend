import React from "react";
import { cn } from "@/lib/utils";

const SESSIONS = ["London", "New York", "Asian", "Sydney", "Overlap"];

export default function SessionHeatmap({ sessionMap }) {
  if (!sessionMap || !Object.keys(sessionMap).length) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3">Session Performance</h3>
        <p className="text-xs text-muted-foreground">No session data yet.</p>
      </div>
    );
  }

  const maxPL = Math.max(...Object.values(sessionMap).map(s => Math.abs(s.pl)), 1);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-4">Session Performance</h3>
      <div className="space-y-2.5">
        {SESSIONS.map(session => {
          const s = sessionMap[session];
          if (!s) return (
            <div key={session} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-24">{session}</span>
              <div className="flex-1 h-6 bg-secondary/30 rounded-md flex items-center px-2">
                <span className="text-[10px] text-muted-foreground/50">No trades</span>
              </div>
            </div>
          );

          const wr = ((s.wins / s.total) * 100).toFixed(0);
          const intensity = Math.abs(s.pl) / maxPL;
          const isPos = s.pl >= 0;

          return (
            <div key={session} className="flex items-center gap-3">
              <span className="text-xs font-medium w-24 flex-shrink-0">{session}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">{s.total} trades · {wr}% WR</span>
                  <span className={cn("text-[10px] font-mono font-semibold", isPos ? "text-success" : "text-destructive")}>
                    {isPos ? "+" : ""}{s.pl.toFixed(2)}
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", isPos ? "bg-success" : "bg-destructive")}
                    style={{ width: `${intensity * 100}%`, opacity: 0.4 + intensity * 0.6 }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}