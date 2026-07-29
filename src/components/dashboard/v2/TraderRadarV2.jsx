import React from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

function computeRadarDims(trades) {
  const total = trades.length;
  if (!total) return null;

  const violations = trades.reduce((s, t) => s + (t.rule_violations?.length || 0), 0);
  const revengeCount = trades.filter(t => t.emotional_state === "Revenge").length;
  const discipline = Math.max(0, Math.min(100, 100 - (violations / total) * 40 - (revengeCount / total) * 30));

  const hasSL = trades.filter(t => t.stop_loss != null).length;
  const riskMgmt = Math.max(0, Math.min(100, (hasSL / total) * 60 + Math.min(40, ((trades.reduce((s, t) => s + (t.rr ?? t.risk_reward_ratio ?? 0), 0) / total) * 15))));

  const badEmotions = trades.filter(t => ["FOMO", "Revenge", "Anxious", "Frustrated", "Fearful"].includes(t.emotional_state)).length;
  const emotionalControl = Math.max(0, Math.min(100, 100 - (badEmotions / total) * 60));

  const fomoCount = trades.filter(t => t.emotional_state === "FOMO").length;
  const lowConfTrades = trades.filter(t => t.confidence_level && t.confidence_level < 5).length;
  const patience = Math.max(0, Math.min(100, 100 - (fomoCount / total) * 50 - (lowConfTrades / total) * 30));

  const avgExec = trades.filter(t => t.execution_rating).reduce((s, t) => s + t.execution_rating, 0) / Math.max(trades.filter(t => t.execution_rating).length, 1);
  const executionQuality = Math.min(100, (avgExec / 10) * 100 || 60);

  const tradeDays = new Set(trades.filter(t => t.createdAt).map(t => t.createdAt.slice(0, 10))).size;
  const dayRange = trades.reduce((acc, t) => {
    if (!t.createdAt) return acc;
    const d = new Date(t.createdAt);
    return { min: Math.min(acc.min, d), max: Math.max(acc.max, d) };
  }, { min: Infinity, max: -Infinity });
  const totalDays = dayRange.min === Infinity ? 1 : Math.max(1, Math.round((dayRange.max - dayRange.min) / 86400000) + 1);
  const consistency = Math.max(0, Math.min(100, (tradeDays / Math.max(totalDays * 0.3, 1)) * 100));

  return { discipline, riskMgmt, emotionalControl, patience, executionQuality, consistency };
}

const scoreLabel = (v) => v >= 80 ? "Strong" : v >= 50 ? "Average" : "Weak";
const scoreColor = (v) => v >= 80 ? "text-emerald-500" : v >= 50 ? "text-warning" : "text-destructive";
const scoreBg = (v) => v >= 80 ? "bg-emerald-500/10 border-emerald-500/20" : v >= 50 ? "bg-warning/10 border-warning/20" : "bg-destructive/10 border-destructive/20";

const descMap = {
  discipline: (v) => v >= 80 ? "Excellent rule adherence and plan execution." : v >= 50 ? "Some violations — tighten rule adherence." : "Frequent violations are costing you profits.",
  riskMgmt: (v) => v >= 80 ? "Consistent risk control across all trades." : v >= 50 ? "Risk management needs more consistency." : "Inconsistent sizing is hurting your P/L.",
  emotionalControl: (v) => v >= 80 ? "You trade with strong emotional discipline." : v >= 50 ? "Occasional emotional trades detected." : "Emotional trading is your biggest leak.",
  patience: (v) => v >= 80 ? "You wait for high-quality setups." : v >= 50 ? "Some FOMO entries detected." : "You enter trades earlier than planned.",
  executionQuality: (v) => v >= 80 ? "Excellent entry and exit precision." : v >= 50 ? "Execution quality is developing." : "Focus on improving entry timing.",
  consistency: (v) => v >= 80 ? "You trade consistently and routinely." : v >= 50 ? "Routine consistency is building." : "Build a more consistent trading routine.",
};

export default function TraderRadarV2({ trades = [] }) {
  const dims = computeRadarDims(trades);
  const total = trades.length;

  if (total < 10) {
    return (
      <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3 h-full">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Trader Radar</h3>
        </div>
        <p className="text-xs text-muted-foreground">Your performance across 6 core trading dimensions.</p>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6 filter blur-sm pointer-events-none select-none">
          <div className="h-[150px] w-full opacity-20">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={[{axis:"D",value:70},{axis:"R",value:60},{axis:"E",value:50},{axis:"P",value:80},{axis:"Q",value:65},{axis:"C",value:55}]}>
                <PolarGrid /><PolarAngleAxis dataKey="axis" />
                <Radar dataKey="value" fill="hsl(var(--primary))" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">Trader Radar unlocks after 10 trades.</p>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mt-2">
            <div className="h-full bg-primary rounded-full" style={{ width: `${(total / 10) * 100}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Current progress: {total}/10 trades</p>
        </div>
      </div>
    );
  }

  const dimList = [
    { key: "discipline", axis: "Discipline", value: Math.round(dims.discipline) },
    { key: "riskMgmt", axis: "Risk Mgmt", value: Math.round(dims.riskMgmt) },
    { key: "emotionalControl", axis: "Emotional Ctrl", value: Math.round(dims.emotionalControl) },
    { key: "patience", axis: "Patience", value: Math.round(dims.patience) },
    { key: "executionQuality", axis: "Execution", value: Math.round(dims.executionQuality) },
    { key: "consistency", axis: "Consistency", value: Math.round(dims.consistency) },
  ];

  const strongest = [...dimList].sort((a, b) => b.value - a.value)[0];
  const weakest = [...dimList].sort((a, b) => a.value - b.value)[0];

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Trader Radar</h3>
          <p className="text-[11px] text-muted-foreground">Your performance across 6 core trading dimensions.</p>
        </div>
      </div>

      <div className="flex gap-3">
        {/* Radar chart */}
        <div className="flex-1 h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={dimList} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={1.5} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Sidebar insights */}
        <div className="flex flex-col gap-2 w-36 flex-shrink-0">
          <div className={cn("p-2 rounded-xl border", scoreBg(strongest.value))}>
            <p className="text-[9px] text-muted-foreground">🟢 Strongest Trait</p>
            <p className={cn("text-xs font-bold", scoreColor(strongest.value))}>{strongest.axis}</p>
            <p className="text-[10px] text-muted-foreground">{strongest.value}/100</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{descMap[strongest.key]?.(strongest.value)}</p>
          </div>
          <div className="p-2 rounded-xl bg-destructive/10 border border-destructive/20">
            <p className="text-[9px] text-muted-foreground">● Biggest Weakness</p>
            <p className="text-xs font-bold text-destructive">{weakest.axis}</p>
            <p className="text-[10px] text-muted-foreground">{weakest.value}/100</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{descMap[weakest.key]?.(weakest.value)}</p>
          </div>
          <div className="p-2 rounded-xl bg-primary/8 border border-primary/20">
            <p className="text-[9px] text-muted-foreground">⭐ Biggest Opportunity</p>
            <p className="text-xs font-bold text-primary">Improve {weakest.axis}</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Small gains here have the biggest impact on your P/L.</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground">Scores based on your last {total} trades.</p>
        <Link to="/assistant" className="flex items-center gap-1 text-[10px] text-primary font-semibold hover:underline">
          View Action Plan <ArrowRight className="w-2.5 h-2.5" />
        </Link>
      </div>

      <p className="text-[11px] text-muted-foreground">
        <span className="text-primary font-semibold">Focus on {weakest.axis.toLowerCase()}.</span> Small improvements in your weakest area will have the biggest impact on long-term profitability.
      </p>
    </div>
  );
}