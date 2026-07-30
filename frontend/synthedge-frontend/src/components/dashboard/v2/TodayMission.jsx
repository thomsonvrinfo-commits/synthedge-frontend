import React, { useState } from "react";
import { Target, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_MISSIONS = [
  "Complete Pre-Market Check-In",
  "Follow Risk Plan",
  "Journal Every Trade",
  "Review Session Before Logout",
];

export default function TodayMission({ rules = [] }) {
  const missions = rules.length > 0
    ? rules.slice(0, 4).map(r => r.title || r)
    : DEFAULT_MISSIONS;

  const [checked, setChecked] = useState(() => new Set());

  const toggle = (i) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const done = checked.size;
  const total = missions.length;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Today's Mission</h3>
        </div>
        <span className="text-xs font-mono text-muted-foreground">{done}/{total}</span>
      </div>

      <div className="space-y-2.5 flex-1">
        {missions.map((m, i) => {
          const isDone = checked.has(i);
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={cn(
                "w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left",
                isDone
                  ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                  : "bg-secondary/40 border-border/50 hover:border-primary/30 hover:bg-primary/5"
              )}
            >
              {isDone
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                : <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              }
              <span className={cn("text-xs font-medium", isDone ? "line-through text-muted-foreground" : "text-foreground")}>
                {m}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Progress</span>
          <span className="font-semibold">{pct}%</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}