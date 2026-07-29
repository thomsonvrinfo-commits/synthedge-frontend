import React from "react";
import { TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";
import { computeConsistencyScore } from "@/lib/traderUtils";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

function getLevel(score) {
  if (score >= 90) return "Elite Trader";
  if (score >= 75) return "Advanced Trader";
  if (score >= 60) return "Consistent Trader";
  if (score >= 40) return "Developing Trader";
  return "Beginner Trader";
}

function computeDimensions(trades, stats) {
  const total = trades.length || 1;
  const violations = trades.reduce((s, t) => s + (t.rule_violations?.length || 0), 0);
  const revengeCount = trades.filter(t => t.emotional_state === "Revenge").length;
  const discipline = Math.max(0, Math.min(100, 100 - (violations / total) * 40 - (revengeCount / total) * 30));
  const avgExec = trades.filter(t => t.execution_rating).reduce((s, t) => s + t.execution_rating, 0) / Math.max(trades.filter(t => t.execution_rating).length, 1);
  const execution = Math.min(100, (avgExec / 10) * 100 || 65);
  const avgRR = stats.avgRR || 0;
  const riskMgmt = Math.max(0, Math.min(100, avgRR > 0 ? Math.min(100, avgRR * 33) : 50));
  const badEmotions = trades.filter(t => ["FOMO", "Revenge", "Anxious", "Frustrated", "Fearful"].includes(t.emotional_state)).length;
  const psychology = Math.max(0, Math.min(100, 100 - (badEmotions / total) * 50));
  const consistency = computeConsistencyScore(trades);
  return { discipline, execution, riskMgmt, psychology, consistency };
}

// Split trades into two periods for comparison
function splitPeriods(trades) {
  const sorted = [...trades].sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date));
  const mid = Math.floor(sorted.length / 2);
  return { prev: sorted.slice(0, mid), curr: sorted.slice(mid) };
}

export default function TraderDevelopmentScoreV2({ stats, trades = [] }) {
  const total = trades.length;

  if (total < 20) {
    return (
      <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3 h-full">
        <h3 className="text-sm font-semibold">Trader Development Score</h3>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-4">
          <p className="text-sm text-muted-foreground text-center">Log more trades to unlock Development Analysis.</p>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${(total / 20) * 100}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">{total} / 20 trades required</p>
        </div>
        <Link to="/journal" className="text-xs text-primary text-center hover:underline">Log a Trade →</Link>
      </div>
    );
  }

  const { prev, curr } = splitPeriods(trades);
  const currStats = { ...stats };
  const dims = computeDimensions(curr.length ? curr : trades, currStats);
  const prevDims = computeDimensions(prev.length ? prev : trades, currStats);

  const score = Math.round(
    dims.discipline * 0.3 + dims.execution * 0.25 + dims.riskMgmt * 0.2 + dims.psychology * 0.15 + dims.consistency * 0.1
  );
  const prevScore = Math.round(
    prevDims.discipline * 0.3 + prevDims.execution * 0.25 + prevDims.riskMgmt * 0.2 + prevDims.psychology * 0.15 + prevDims.consistency * 0.1
  );
  const delta = score - prevScore;

  const dimEntries = [
    { key: "discipline", label: "Discipline" },
    { key: "execution", label: "Execution" },
    { key: "riskMgmt", label: "Risk Mgmt" },
    { key: "psychology", label: "Psychology" },
    { key: "consistency", label: "Consistency" },
  ];

  const deltas = dimEntries.map(d => ({ ...d, delta: Math.round(dims[d.key] - prevDims[d.key]) }));
  const biggestImprovement = [...deltas].sort((a, b) => b.delta - a.delta)[0];
  const needsAttention = [...deltas].sort((a, b) => a.delta - b.delta)[0];

  const radarData = dimEntries.map(d => ({
    axis: d.label,
    current: Math.round(dims[d.key]),
    previous: Math.round(prevDims[d.key]),
  }));

  const GrowthIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const growthColor = delta > 0 ? "text-emerald-500" : delta < 0 ? "text-destructive" : "text-muted-foreground";
  const growthLabel = delta > 0 ? "IMPROVING" : delta < 0 ? "DECLINING" : "STAGNATING";
  const growthEmoji = delta > 0 ? "🚀" : delta < 0 ? "📉" : "⚠";

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3 h-full cursor-pointer hover:border-primary/30 transition-colors">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Trader Development Score</h3>
        <span className={cn("flex items-center gap-1 text-xs font-semibold", growthColor)}>
          <GrowthIcon className="w-3.5 h-3.5" />
          {growthEmoji} {growthLabel} {delta !== 0 && `${delta > 0 ? "+" : ""}${delta} this period`}
        </span>
      </div>

      <div className="flex items-start gap-3">
        {/* Score */}
        <div className="text-center flex-shrink-0">
          <span className="text-4xl font-black tabular-nums">{score}</span>
          <span className="text-sm text-muted-foreground font-bold">/100</span>
          <p className="text-[11px] text-muted-foreground mt-0.5">Level</p>
          <p className="text-xs font-semibold text-primary">{getLevel(score)}</p>
        </div>

        {/* Improvement / Attention */}
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <div className="p-2 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
            <p className="text-[9px] text-muted-foreground">📈 Biggest Improvement</p>
            <p className="text-xs font-bold text-emerald-600">{biggestImprovement.label}</p>
            <p className="text-[10px] text-emerald-600">{biggestImprovement.delta > 0 ? "+" : ""}{biggestImprovement.delta} pts</p>
          </div>
          <div className="p-2 rounded-xl bg-destructive/8 border border-destructive/20">
            <p className="text-[9px] text-muted-foreground">⚠ Needs Attention</p>
            <p className="text-xs font-bold text-destructive">{needsAttention.label}</p>
            <p className="text-[10px] text-destructive">{needsAttention.delta > 0 ? "+" : ""}{needsAttention.delta} pts</p>
          </div>
        </div>

        {/* Radar */}
        <div className="flex-1 h-[140px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
              <Radar dataKey="previous" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.08} strokeWidth={1} strokeDasharray="3 3" />
              <Radar dataKey="current" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-muted-foreground rounded inline-block opacity-50" style={{ borderStyle: "dashed" }} /> Previous</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-primary rounded inline-block" /> Current</span>
        </div>
        <Link to="/assistant" className="flex items-center gap-1 text-[10px] text-primary font-semibold hover:underline">
          Full Report <ArrowRight className="w-2.5 h-2.5" />
        </Link>
      </div>
    </div>
  );
}