import React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import SectionHeader from "./SectionHeader";
import AIInsight from "./AIInsight";

export default function Section3BehavioralIntel({ stats, trades }) {
  // Psychology
  const emotionMap = stats.emotionMap || {};
  const sorted = Object.entries(emotionMap).sort(([,a],[,b]) => (b.wins/b.total)-(a.wins/a.total));
  const bestState = sorted[0];
  const worstState = sorted[sorted.length - 1];
  const badEmotions = ["FOMO","Revenge","Anxious","Frustrated","Fearful"];
  const triggerMap = {};
  trades.filter(t => badEmotions.includes(t.emotional_state)).forEach(t => {
    triggerMap[t.emotional_state] = (triggerMap[t.emotional_state] || 0) + 1;
  });
  const mostCommonTrigger = Object.entries(triggerMap).sort(([,a],[,b]) => b - a)[0];
  const worstWR = worstState ? Math.round((worstState[1].wins / worstState[1].total) * 100) : null;
  const bestWR = bestState ? Math.round((bestState[1].wins / bestState[1].total) * 100) : null;
  const psyInsight = worstState
    ? `You lose ${worstWR !== null ? 100 - worstWR : "more"}% of trades when ${worstState[0].toLowerCase()}. Avoid trading after consecutive losses.`
    : "Log emotional states on your trades to unlock psychology intelligence.";

  // Discipline
  const revengeTrades = trades.filter(t => t.emotional_state === "Revenge").length;
  const hasSL = trades.filter(t => t.stop_loss != null).length;
  const disciplineChecks = [
    { label: "No revenge trades", pass: revengeTrades === 0 },
    { label: "Journal completion", pass: trades.length >= 5 },
    { label: "Stop-loss compliance", pass: hasSL / Math.max(trades.length, 1) > 0.7 },
    { label: "Risk consistency", pass: stats.disciplineScore >= 70 },
  ];
  const disciplineInsight = stats.disciplineScore >= 80
    ? "Excellent discipline is protecting your capital and compounding your results."
    : `Discipline score ${stats.disciplineScore}/100. Focus on eliminating ${disciplineChecks.filter(c => !c.pass).map(c => c.label.toLowerCase())[0] || "rule violations"}.`;

  // Mistake Intelligence
  const violationCounts = {};
  let mostExpensiveMistake = { label: "—", cost: 0 };
  trades.forEach(t => {
    t.rule_violations?.forEach(v => { violationCounts[v] = (violationCounts[v] || 0) + 1; });
    if (t.result === "Loss" && Math.abs(t.profit_loss || 0) > Math.abs(mostExpensiveMistake.cost)) {
      mostExpensiveMistake = { label: t.rule_violations?.[0] || t.emotional_state || "Untagged Loss", cost: t.profit_loss || 0 };
    }
  });
  const mostFreqViolation = Object.entries(violationCounts).sort(([,a],[,b]) => b-a)[0];
  const freqMistake = trades.filter(t => t.execution_rating && t.execution_rating < 4).length > 2
    ? { label: "Early Entries", occurrences: trades.filter(t => t.execution_rating && t.execution_rating < 4).length }
    : mostFreqViolation ? { label: mostFreqViolation[0], occurrences: mostFreqViolation[1] } : { label: "None Detected", occurrences: 0 };

  return (
    <div className="bg-card/50 border border-border/60 rounded-2xl p-5">
      <SectionHeader number={3} title="Behavioral Intelligence" subtitle="Why you win and why you lose." />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Psychology */}
        <div className="space-y-2">
          <p className="text-xs font-bold">🧠 Psychology Intelligence</p>
          {bestState && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Best Mental State</span>
              <div className="text-right"><p className="font-semibold text-emerald-500">{bestState[0]}</p><p className="text-[10px] text-muted-foreground">Win Rate {bestWR}%</p></div>
            </div>
          )}
          {worstState && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Worst Mental State</span>
              <div className="text-right"><p className="font-semibold text-destructive">{worstState[0]}</p><p className="text-[10px] text-muted-foreground">Win Rate {worstWR}%</p></div>
            </div>
          )}
          {mostCommonTrigger && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Most Common Trigger</span>
              <p className="font-semibold text-warning">{mostCommonTrigger[0]}</p>
            </div>
          )}
          <AIInsight text={psyInsight} />
        </div>

        {/* Discipline */}
        <div className="space-y-2">
          <p className="text-xs font-bold">⚙️ Discipline Intelligence</p>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-black">{Math.round(stats.disciplineScore)}</span>
            <span className="text-muted-foreground text-sm">/100</span>
          </div>
          <div className="space-y-1.5">
            {disciplineChecks.map(c => (
              <div key={c.label} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{c.label}</span>
                {c.pass
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  : <XCircle className="w-3.5 h-3.5 text-destructive" />
                }
              </div>
            ))}
          </div>
          <AIInsight text={disciplineInsight} />
        </div>

        {/* Mistake Intelligence */}
        <div className="space-y-2">
          <p className="text-xs font-bold">⚠️ Mistake Intelligence</p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Most Frequent Mistake</span>
              <div className="text-right"><p className="font-semibold">{freqMistake.label}</p><p className="text-[10px] text-muted-foreground">Occurrences: {freqMistake.occurrences}</p></div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Most Expensive</span>
              <div className="text-right"><p className="font-semibold">{mostExpensiveMistake.label}</p><p className="text-[10px] text-destructive">Cost: ${mostExpensiveMistake.cost.toFixed(2)}</p></div>
            </div>
            {mostFreqViolation && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Most Violated Rule</span>
                <p className="font-semibold">{mostFreqViolation[0]}</p>
              </div>
            )}
          </div>
          <AIInsight text="Fixing these mistakes has the highest ROI. Focus here for fast improvement." />
        </div>
      </div>
    </div>
  );
}