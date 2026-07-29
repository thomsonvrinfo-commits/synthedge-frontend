import React from "react";
import { GOAL_DEFINITIONS } from "@/lib/traderUtils";
import { cn } from "@/lib/utils";

function getGoalProgress(goal, stats, trades) {
  switch (goal) {
    case "Discipline":
      return { score: stats.disciplineScore || 0, hint: `${stats.violationCount || 0} violations` };
    case "Emotional Control": {
      const badEmotions = ["FOMO", "Revenge", "Anxious", "Frustrated", "Fearful"];
      const bad = trades.filter(t => badEmotions.includes(t.emotional_state)).length;
      const score = Math.max(0, 100 - (bad / Math.max(trades.length, 1)) * 100);
      return { score, hint: `${bad} emotional trades` };
    }
    case "Higher RR":
      return { score: Math.min(100, (stats.avgRR / 3) * 100), hint: `Avg RR: ${stats.avgRR}` };
    case "Risk Management": {
      const lowRR = trades.filter(t => t.risk_reward_ratio && t.risk_reward_ratio < 1.5).length;
      const score = Math.max(0, 100 - (lowRR / Math.max(trades.length, 1)) * 100);
      return { score, hint: `${lowRR} sub-1.5R trades` };
    }
    case "Better Entries":
      return { score: stats.avgExecution ? (stats.avgExecution / 10) * 100 : 0, hint: `Avg execution: ${stats.avgExecution}/10` };
    case "Avoiding Revenge Trading": {
      const revenge = trades.filter(t => t.emotional_state === "Revenge").length;
      const score = Math.max(0, 100 - (revenge / Math.max(trades.length, 1)) * 100);
      return { score, hint: `${revenge} revenge trades` };
    }
    default:
      return { score: stats.winRate || 0, hint: `${stats.winRate || 0}% win rate` };
  }
}

export default function GoalProgressCard({ goals, stats, trades }) {
  if (!goals || !goals.length) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-4">Goal Progress</h3>
      <div className="space-y-3">
        {goals.slice(0, 4).map(goal => {
          const def = GOAL_DEFINITIONS[goal];
          const { score, hint } = getGoalProgress(goal, stats, trades);
          return (
            <div key={goal}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{def?.icon}</span>
                  <span className="text-xs font-medium">{goal}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{hint}</span>
                  <span className="text-xs font-mono font-semibold">{Math.round(score)}%</span>
                </div>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    score >= 75 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-destructive"
                  )}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}