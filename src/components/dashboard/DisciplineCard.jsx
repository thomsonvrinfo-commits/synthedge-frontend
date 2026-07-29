import React from "react";
import ScoreRing from "@/components/ui/score-ring";
import { computeConsistencyScore } from "@/lib/traderUtils";
import { cn } from "@/lib/utils";

export default function DisciplineCard({ stats, trades }) {
  const consistency = computeConsistencyScore(trades);
  const emotional = Math.max(0, Math.min(100,
    100 - (stats.badEmotionCount / Math.max(stats.total, 1)) * 100
  ));

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-4">Trader Scores</h3>
      <div className="flex items-center justify-around">
        <ScoreRing score={stats.disciplineScore || 0} label="Discipline" />
        <ScoreRing score={consistency} label="Consistency" color="#60a5fa" />
        <ScoreRing score={Math.round(emotional)} label="Emotional" color="#a855f7" />
      </div>
      <div className="mt-4 pt-4 border-t border-border space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Rule Violations</span>
          <span className={cn("font-mono font-semibold", stats.violationCount > 0 ? "text-destructive" : "text-success")}>
            {stats.violationCount || 0}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Emotional Disruptions</span>
          <span className={cn("font-mono font-semibold", stats.badEmotionCount > 0 ? "text-warning" : "text-success")}>
            {stats.badEmotionCount || 0}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Avg Execution</span>
          <span className="font-mono font-semibold">{stats.avgExecution || "—"}/10</span>
        </div>
      </div>
    </div>
  );
}