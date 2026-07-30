import React, { useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import SectionHeader from "./SectionHeader";

const CATEGORIES = ["All", "Discipline", "Risk Management", "Consistency", "Growth", "DNA Evolution"];

function buildAchievements(trades) {
  const total = trades.length;
  const violations = trades.reduce((s, t) => s + (t.rule_violations?.length || 0), 0);
  const tradeDays = [...new Set(trades.filter(t => t.trade_date).map(t => t.trade_date.slice(0, 10)))].sort();
  let streak = 0, maxStreak = 0, cur = 0;
  tradeDays.forEach(day => {
    const dayTrades = trades.filter(t => t.trade_date?.slice(0, 10) === day);
    const hasViolation = dayTrades.some(t => t.rule_violations?.length > 0);
    if (!hasViolation) { cur++; maxStreak = Math.max(maxStreak, cur); }
    else cur = 0;
  });

  const monthMap = {};
  trades.filter(t => t.trade_date && t.profit_loss != null).forEach(t => {
    const m = t.trade_date.slice(0, 7);
    monthMap[m] = (monthMap[m] || 0) + t.profit_loss;
  });
  const hasProftableMonth = Object.values(monthMap).some(v => v > 0);

  const strategies = new Set(trades.filter(t => t.strategy).map(t => t.strategy)).size;

  return [
    { emoji: "🔥", label: "30-Day Discipline Streak", category: "Discipline", current: maxStreak, target: 30, status: maxStreak >= 30 ? "unlocked" : "progress" },
    { emoji: "📝", label: "100 Trades Logged", category: "Consistency", current: total, target: 100, status: total >= 100 ? "unlocked" : "progress" },
    { emoji: "✅", label: "No Rule Violations (50 Trades)", category: "Discipline", current: violations === 0 ? Math.min(total, 50) : 0, target: 50, status: violations === 0 && total >= 50 ? "unlocked" : violations === 0 ? "progress" : "locked" },
    { emoji: "🛡️", label: "Maintain 1% Risk (50 Trades)", category: "Risk Management", current: Math.min(total, 50), target: 50, status: total >= 50 ? "unlocked" : "progress" },
    { emoji: "💰", label: "First Profitable Month", category: "Growth", current: hasProftableMonth ? 1 : 0, target: 1, status: hasProftableMonth ? "unlocked" : "locked" },
    { emoji: "🧬", label: "DNA Evolution Milestone", category: "DNA Evolution", current: strategies >= 3 ? 1 : 0, target: 1, status: strategies >= 3 ? "unlocked" : "progress" },
    { emoji: "📅", label: "3 Consecutive Green Months", category: "Growth", current: Object.values(monthMap).filter(v => v > 0).length, target: 3, status: Object.values(monthMap).filter(v => v > 0).length >= 3 ? "unlocked" : "locked" },
  ];
}

export default function Section7Achievements({ trades }) {
  const [activeCategory, setActiveCategory] = useState("All");
  const achievements = buildAchievements(trades);
  const filtered = activeCategory === "All" ? achievements : achievements.filter(a => a.category === activeCategory);
  const unlocked = achievements.filter(a => a.status === "unlocked").length;

  return (
    <div className="bg-card/50 border border-border/60 rounded-2xl p-5">
      <SectionHeader number={7} title="Achievements & Milestones" subtitle="Celebrating discipline, consistency and growth." />
      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setActiveCategory(c)}
            className={cn("px-3 py-1 rounded-full text-xs font-semibold border transition-all",
              activeCategory === c ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground"
            )}>
            {c}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground self-center">{unlocked}/{achievements.length} unlocked</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {filtered.map((a, i) => (
          <div key={i} className={cn(
            "flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all",
            a.status === "unlocked" ? "bg-emerald-500/8 border-emerald-500/25" :
            a.status === "progress" ? "bg-primary/8 border-primary/20" :
            "bg-secondary/20 border-border/30 opacity-60"
          )}>
            <span className={cn("text-2xl", a.status === "locked" && "grayscale opacity-40")}>{a.emoji}</span>
            {a.status === "locked" && <Lock className="w-3 h-3 text-muted-foreground -mt-1" />}
            <p className="text-[10px] text-muted-foreground leading-tight">{a.label}</p>
            {a.status !== "locked" && (
              <div className="w-full">
                <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", a.status === "unlocked" ? "bg-emerald-500" : "bg-primary")}
                    style={{ width: `${Math.min(100, (a.current / a.target) * 100)}%` }} />
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">{a.current} / {a.target}</p>
              </div>
            )}
            <span className={cn("text-[9px] font-bold",
              a.status === "unlocked" ? "text-emerald-500" : a.status === "progress" ? "text-primary" : "text-muted-foreground"
            )}>
              {a.status === "unlocked" ? "✓ Unlocked" : a.status === "progress" ? "In Progress" : "🔒 Locked"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}