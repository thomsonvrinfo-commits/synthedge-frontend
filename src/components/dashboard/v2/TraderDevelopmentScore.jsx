import React from "react";
import { TrendingUp } from "lucide-react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";
import { computeConsistencyScore } from "@/lib/traderUtils";
import { cn } from "@/lib/utils";

export default function TraderDevelopmentScore({ stats, trades = [] }) {
  const consistency = computeConsistencyScore(trades);
  const psychology = Math.max(0, Math.min(100,
    100 - (stats.badEmotionCount / Math.max(stats.total, 1)) * 50
  ));
  const riskMgmt = Math.max(0, Math.min(100,
    stats.avgRR > 0 ? Math.min(100, stats.avgRR * 33) : 50
  ));
  const execution = Math.min(100, (stats.avgExecution / 10) * 100 || 60);

  const score = Math.round(
    (stats.disciplineScore * 0.3 + psychology * 0.25 + consistency * 0.25 + riskMgmt * 0.2)
  );
  const weekChange = +5; // Static for now

  const radarData = [
    { axis: "Discipline", value: stats.disciplineScore },
    { axis: "Psychology", value: psychology },
    { axis: "Consistency", value: consistency },
    { axis: "Risk Mgmt", value: riskMgmt },
    { axis: "Execution", value: execution },
  ];

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Trader Development Score</h3>
        <span className={cn(
          "flex items-center gap-1 text-xs font-semibold",
          weekChange >= 0 ? "text-emerald-600" : "text-red-500"
        )}>
          <TrendingUp className="w-3.5 h-3.5" />
          {weekChange >= 0 ? "+" : ""}{weekChange} vs last week
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-center">
          <span className="text-5xl font-black tabular-nums">{score}</span>
          <span className="text-lg text-muted-foreground font-bold"> /100</span>
          <p className="text-[11px] text-muted-foreground mt-1">Overall Score</p>
        </div>
        <div className="flex-1 h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <Radar
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1 pt-1 border-t border-border/50">
        {radarData.map(d => (
          <div key={d.axis} className="text-center">
            <p className="text-xs font-bold">{Math.round(d.value)}</p>
            <p className="text-[9px] text-muted-foreground leading-tight">{d.axis}</p>
          </div>
        ))}
      </div>
    </div>
  );
}