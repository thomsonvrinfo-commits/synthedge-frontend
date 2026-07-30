import React from "react";
import { Trophy, Star, TrendingUp, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PersonalBests({ trades = [] }) {
  if (!trades.length) return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5">
      <h3 className="text-sm font-semibold mb-3">Personal Bests</h3>
      <p className="text-xs text-muted-foreground">Log trades to unlock your personal bests.</p>
    </div>
  );

  // Best win rate setup
  const setupMap = {};
  trades.filter(t => t.strategy).forEach(t => {
    if (!setupMap[t.strategy]) setupMap[t.strategy] = { wins: 0, total: 0 };
    setupMap[t.strategy].total++;
    if (t.result === "Win") setupMap[t.strategy].wins++;
  });
  const bestSetupEntry = Object.entries(setupMap)
    .filter(([, s]) => s.total >= 2)
    .sort(([, a], [, b]) => (b.wins / b.total) - (a.wins / a.total))[0];
  const bestWinRate = bestSetupEntry
    ? parseFloat(((bestSetupEntry[1].wins / bestSetupEntry[1].total) * 100).toFixed(0))
    : parseFloat(((trades.filter(t => t.result === "Win").length / trades.length) * 100).toFixed(0));

  // Best single trade RR
  const highestRR = Math.max(0, ...trades.map(t => t.risk_reward_ratio || 0));

  // Best week P/L
  const weekMap = {};
  trades.filter(t => t.trade_date && t.profit_loss != null).forEach(t => {
    const d = new Date(t.trade_date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const wk = weekStart.toISOString().slice(0, 10);
    weekMap[wk] = (weekMap[wk] || 0) + t.profit_loss;
  });
  const bestWeek = Math.max(0, ...Object.values(weekMap));

  // Discipline streak (simplified: consecutive days with no violations)
  const tradeDays = [...new Set(trades.filter(t => t.trade_date).map(t => t.trade_date.slice(0, 10)))].sort();
  let streak = 0, maxStreak = 0, cur = 0;
  tradeDays.forEach((day) => {
    const dayTrades = trades.filter(t => t.trade_date?.slice(0, 10) === day);
    const hasViolation = dayTrades.some(t => t.rule_violations?.length > 0);
    if (!hasViolation) { cur++; maxStreak = Math.max(maxStreak, cur); }
    else cur = 0;
  });

  const bests = [
    { icon: Trophy, label: "Best Discipline Streak", value: `${maxStreak} Days`, color: "text-orange-500", bg: "bg-orange-500/10" },
    { icon: Calendar, label: "Best Week (P/L)", value: bestWeek > 0 ? `+$${bestWeek.toFixed(0)}` : "—", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { icon: Star, label: "Best Win Rate", value: `${bestWinRate}%`, color: "text-yellow-500", bg: "bg-yellow-500/10" },
    { icon: TrendingUp, label: "Highest RR Trade", value: highestRR > 0 ? `${highestRR.toFixed(1)}R` : "—", color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Personal Bests</h3>
      <div className="space-y-2.5">
        {bests.map((b) => (
          <div key={b.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", b.bg)}>
                <b.icon className={cn("w-3.5 h-3.5", b.color)} />
              </div>
              <span className="text-xs text-muted-foreground">{b.label}</span>
            </div>
            <span className={cn("text-xs font-bold", b.color)}>{b.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}