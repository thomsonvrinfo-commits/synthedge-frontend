import React, { useState } from "react";
import { Target, Edit3 } from "lucide-react";
import { cn } from "@/lib/utils";

function generateFocusItems(stats, trades) {
  const items = [];

  if (stats.bestSetup) {
    items.push({ text: `Trade only ${stats.bestSetup.name} setups`, done: false });
  } else {
    items.push({ text: "Focus on your highest win-rate setup", done: false });
  }

  if (stats.avgRR > 0 && stats.avgRR < 2) {
    items.push({ text: "Target minimum 2:1 RR per trade", done: false });
  } else {
    items.push({ text: "Risk max 1% per trade", done: false });
  }

  if (stats.bestSession) {
    items.push({ text: `Prioritize ${stats.bestSession.name} Session entries`, done: false });
  } else {
    items.push({ text: "Trade only during planned sessions", done: false });
  }

  const badEmotions = trades.filter(t => ["FOMO", "Revenge"].includes(t.emotional_state)).length;
  if (badEmotions > 0) {
    items.push({ text: "No trading after 2 consecutive losses", done: false });
  } else {
    items.push({ text: "Focus on high-probability setups only", done: false });
  }

  return items.slice(0, 4);
}

export default function TodayFocusCard({ stats, trades = [] }) {
  const [checkedItems, setCheckedItems] = React.useState(new Set());
  const items = generateFocusItems(stats, trades);

  const toggle = (i) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Today's Focus</h3>
        </div>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <Edit3 className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">Your game plan for today</p>
      <div className="space-y-2 flex-1">
        {items.map((item, i) => {
          const done = checkedItems.has(i);
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={cn(
                "w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all text-xs",
                done
                  ? "bg-emerald-500/10 border-emerald-500/30 text-muted-foreground"
                  : "bg-secondary/30 border-border/40 hover:border-primary/30 hover:bg-primary/5 text-foreground"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded-full flex-shrink-0 border flex items-center justify-center",
                done ? "bg-emerald-500 border-emerald-500" : "border-border"
              )}>
                {done && <span className="text-white text-[9px]">✓</span>}
              </div>
              <span className={cn("font-medium leading-tight", done && "line-through")}>{item.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}