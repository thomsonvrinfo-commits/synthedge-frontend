import React from "react";
import { cn } from "@/lib/utils";

function getAchievements(trades, stats) {
  const total = trades.length;
  const wins = trades.filter(t => t.result === "Win").length;
  const violations = trades.reduce((s, t) => s + (t.rule_violations?.length || 0), 0);

  // Discipline streak calc
  const tradeDays = [...new Set(trades.filter(t => t.trade_date).map(t => t.trade_date.slice(0, 10)))].sort();
  let maxStreak = 0, cur = 0;
  tradeDays.forEach(day => {
    const dayTrades = trades.filter(t => t.trade_date?.slice(0, 10) === day);
    const hasViolation = dayTrades.some(t => t.rule_violations?.length > 0);
    if (!hasViolation) { cur++; maxStreak = Math.max(maxStreak, cur); } else cur = 0;
  });

  const defs = [
    { id: "trades10",    emoji: "📝", label: "10 Trades Logged",       unlocked: total >= 10,  progress: Math.min(100, (total / 10) * 100) },
    { id: "trades50",    emoji: "📊", label: "50 Trades Logged",        unlocked: total >= 50,  progress: Math.min(100, (total / 50) * 100) },
    { id: "streak10",    emoji: "🔥", label: "10 Day Discipline Streak",unlocked: maxStreak >= 10, progress: Math.min(100, (maxStreak / 10) * 100) },
    { id: "noviolation", emoji: "✅", label: "No Rule Violations",      unlocked: total >= 5 && violations === 0, progress: total >= 5 ? 100 : (total / 5) * 100 },
    { id: "winrate60",   emoji: "🎯", label: "60% Win Rate",             unlocked: total >= 10 && stats.winRate >= 60, progress: Math.min(100, (stats.winRate / 60) * 100) },
    { id: "review",      emoji: "📋", label: "Monthly Review",           unlocked: total >= 20, progress: Math.min(100, (total / 20) * 100) },
  ];

  return defs;
}

export default function AchievementsCard({ trades = [], stats }) {
  const achievements = getAchievements(trades, stats);
  const unlocked = achievements.filter(a => a.unlocked).length;

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Achievements</h3>
        <span className="text-xs text-muted-foreground font-mono">{unlocked}/{achievements.length}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {achievements.map(a => (
          <div
            key={a.id}
            className={cn(
              "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-center transition-all",
              a.unlocked
                ? "bg-primary/8 border-primary/20"
                : "bg-secondary/30 border-border/30 opacity-60"
            )}
          >
            <span className={cn("text-2xl", !a.unlocked && "grayscale opacity-50")}>{a.emoji}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">{a.label}</span>
            {!a.unlocked && (
              <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${a.progress}%` }} />
              </div>
            )}
            {a.unlocked && <span className="text-[9px] text-primary font-semibold">✓ Unlocked</span>}
          </div>
        ))}
      </div>
    </div>
  );
}