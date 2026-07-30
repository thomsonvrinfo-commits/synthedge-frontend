import React from "react";
import { Dna, Target } from "lucide-react";
import { cn } from "@/lib/utils";

function getArchetype(stats) {
  if (!stats.total) return { name: "Developing", desc: "Keep logging trades to reveal your archetype." };
  if (stats.avgRR >= 2.5 && stats.winRate >= 55) return { name: "Precision Sniper", desc: "You seek high-probability setups and execute with precision. Keep building consistency." };
  if (stats.winRate >= 65) return { name: "High Accuracy Trader", desc: "Your strength is identifying winning trades. Focus on improving your RR." };
  if (stats.avgRR >= 3) return { name: "Risk/Reward Master", desc: "You excel at managing trades for large rewards. Focus on improving win rate." };
  if (stats.disciplineScore >= 80) return { name: "Disciplined Executor", desc: "Your edge is discipline. Systematic, rule-based trading is your superpower." };
  return { name: "Momentum Trader", desc: "You adapt to market conditions. Build a more defined setups framework." };
}

export default function TradingDNA({ stats, trades = [] }) {
  const archetype = getArchetype(stats);

  // Best session
  const sessionMap = {};
  trades.filter(t => t.session).forEach(t => {
    if (!sessionMap[t.session]) sessionMap[t.session] = { wins: 0, total: 0, pl: 0 };
    sessionMap[t.session].total++;
    if (t.result === "Win") sessionMap[t.session].wins++;
    sessionMap[t.session].pl += t.profit_loss || 0;
  });
  const bestSession = Object.entries(sessionMap).sort(([, a], [, b]) => b.pl - a.pl)[0]?.[0] || "—";

  // Best setup
  const setupMap = {};
  trades.filter(t => t.strategy).forEach(t => {
    if (!setupMap[t.strategy]) setupMap[t.strategy] = { wins: 0, total: 0 };
    setupMap[t.strategy].total++;
    if (t.result === "Win") setupMap[t.strategy].wins++;
  });
  const bestSetup = Object.entries(setupMap)
    .filter(([, s]) => s.total >= 2)
    .sort(([, a], [, b]) => (b.wins / b.total) - (a.wins / a.total))[0]?.[0] || "—";

  // Worst habit
  const badEmotionCounts = {};
  trades.filter(t => ["FOMO", "Revenge", "Anxious", "Frustrated", "Fearful"].includes(t.emotional_state)).forEach(t => {
    badEmotionCounts[t.emotional_state] = (badEmotionCounts[t.emotional_state] || 0) + 1;
  });
  const worstHabit = Object.entries(badEmotionCounts).sort(([, a], [, b]) => b - a)[0]?.[0]
    || (stats.violationCount > 0 ? "Rule Violations" : "None Detected");

  const dnaItems = [
    { label: "Best Session", value: bestSession, color: "text-primary", dot: "bg-primary" },
    { label: "Best Setup", value: bestSetup, color: "text-emerald-500", dot: "bg-emerald-500" },
    { label: "Worst Habit", value: worstHabit, color: "text-destructive", dot: "bg-destructive" },
    { label: "Trading Archetype", value: archetype.name, color: "text-yellow-500", dot: "bg-yellow-500" },
  ];

  return (
    <div className="bg-card rounded-2xl border border-primary/20 shadow-sm p-5 flex flex-col gap-4"
      style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(217 85% 50% / 0.04) 100%)" }}>
      <div className="flex items-center gap-2">
        <Dna className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Your Trading DNA</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {dnaItems.map(item => (
          <div key={item.label} className="p-2.5 rounded-xl bg-secondary/40 border border-border/40">
            <p className="text-[10px] text-muted-foreground mb-1">{item.label}</p>
            <div className="flex items-center gap-1.5">
              <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", item.dot)} />
              <p className={cn("text-xs font-bold truncate", item.color)}>{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Archetype description */}
      <div className="p-3 rounded-xl bg-primary/8 border border-primary/15">
        <div className="flex items-start gap-2">
          <Target className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-primary">You are a {archetype.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{archetype.desc}</p>
          </div>
        </div>
      </div>
    </div>
  );
}