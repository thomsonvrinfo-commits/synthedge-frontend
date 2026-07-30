import React from "react";
import { Brain, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const INTELLIGENCE_UNLOCKS = [
  { label: "Session Intelligence",   threshold: 20, key: "session" },
  { label: "Setup Intelligence",     threshold: 30, key: "setup" },
  { label: "Psychology Intelligence",threshold: 50, key: "psychology" },
  { label: "Risk Intelligence",      threshold: 75, key: "risk" },
];

export default function TraderIntelligenceProfile({ tradeCount = 0 }) {
  const pct = Math.min(100, Math.round((tradeCount / 100) * 100));

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Trader Intelligence Profile</h3>
        </div>
        <span className="text-sm font-bold text-primary">{pct}% Complete</span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-violet-500 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{tradeCount} trades logged</span>
          <span>100 trades for full profile</span>
        </div>
      </div>

      {/* Unlock items */}
      <div className="space-y-2">
        {INTELLIGENCE_UNLOCKS.map((item) => {
          const unlocked = tradeCount >= item.threshold;
          const remaining = Math.max(0, item.threshold - tradeCount);
          return (
            <div
              key={item.key}
              className={cn(
                "flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all",
                unlocked
                  ? "bg-primary/5 border-primary/20 text-foreground"
                  : "bg-secondary/40 border-border/40 text-muted-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                {unlocked
                  ? <div className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center">
                      <span className="text-primary text-[9px]">✓</span>
                    </div>
                  : <Lock className="w-3.5 h-3.5 opacity-50" />
                }
                <span className="font-medium">{item.label}</span>
              </div>
              {!unlocked && (
                <span className="text-[10px] font-mono">{remaining} more trades</span>
              )}
              {unlocked && (
                <span className="text-[10px] text-emerald-600 font-semibold">Unlocked</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}