import React from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";

export default function WeaknessRadar({ trades = [] }) {
  const total = trades.length || 1;

  const overtrading = trades.filter(t => {
    const day = t.trade_date?.slice(0, 10);
    return day;
  }).reduce((acc, t) => {
    const day = t.trade_date?.slice(0, 10);
    if (!day) return acc;
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});
  const overtradeDays = Object.values(overtrading).filter(v => v > 3).length;
  const overtradingScore = Math.max(0, 100 - (overtradeDays / Math.max(Object.keys(overtrading).length, 1)) * 100);

  const badEmotions = trades.filter(t => ["FOMO", "Revenge", "Anxious", "Frustrated", "Fearful"].includes(t.emotional_state)).length;
  const emotionalControl = Math.max(0, 100 - (badEmotions / total) * 100);

  const violations = trades.reduce((s, t) => s + (t.rule_violations?.length || 0), 0);
  const ruleAdherence = Math.max(0, 100 - (violations / total) * 30);

  const lowConfidenceTrades = trades.filter(t => t.confidence_level && t.confidence_level < 5).length;
  const patience = Math.max(0, 100 - (lowConfidenceTrades / total) * 60);

  const rrTrades = trades.filter(t => t.risk_reward_ratio);
  const avgRR = rrTrades.length ? rrTrades.reduce((s, t) => s + t.risk_reward_ratio, 0) / rrTrades.length : 1;
  const riskManagement = Math.min(100, avgRR * 33);

  const lowExecTrades = trades.filter(t => t.execution_rating && t.execution_rating < 5).length;
  const earlyEntries = Math.max(0, 100 - (lowExecTrades / total) * 80);

  const data = [
    { axis: "Overtrading",     value: Math.round(overtradingScore) },
    { axis: "Emotional Ctrl",  value: Math.round(emotionalControl) },
    { axis: "Rule Adherence",  value: Math.round(ruleAdherence) },
    { axis: "Patience",        value: Math.round(patience) },
    { axis: "Risk Mgmt",       value: Math.round(riskManagement) },
    { axis: "Early Entries",   value: Math.round(earlyEntries) },
  ];

  // Find weakest area
  const weakest = [...data].sort((a, b) => a.value - b.value)[0];

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Weakness Radar</h3>
        {weakest && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold">
            ⚠ {weakest.axis} {weakest.value}/100
          </span>
        )}
      </div>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <Radar
              dataKey="value"
              stroke="hsl(0 72% 55%)"
              fill="hsl(0 72% 55%)"
              fillOpacity={0.12}
              strokeWidth={1.5}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {data.sort((a, b) => a.value - b.value).slice(0, 3).map(d => (
          <div key={d.axis} className="text-center p-1.5 rounded-lg bg-secondary/40">
            <p className="text-xs font-bold text-destructive">{d.value}</p>
            <p className="text-[9px] text-muted-foreground leading-tight">{d.axis}</p>
          </div>
        ))}
      </div>
    </div>
  );
}