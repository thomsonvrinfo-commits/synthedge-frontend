import React from "react";
import { cn } from "@/lib/utils";

export default function DashboardModeToggle({ mode, onChange }) {
  return (
    <div className="flex items-center bg-secondary/60 rounded-xl p-1 gap-0.5 border border-border/50">
      {["live", "backtest"].map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all",
            mode === m
              ? "bg-card shadow text-foreground border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {m === "live" ? "🟢 LIVE" : "🔁 BACKTEST"}
        </button>
      ))}
    </div>
  );
}