import React, { useState } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import SectionHeader from "./SectionHeader";
import { subDays, isAfter } from "date-fns";

function computePeriodStats(trades) {
  if (!trades.length) return { winRate: 0, discipline: 0, avgRR: 0, riskMgmt: 0, psychology: 0, equity: 0 };
  const wins = trades.filter(t => t.result === "Win").length;
  const winRate = parseFloat(((wins / trades.length) * 100).toFixed(0));
  const violations = trades.reduce((s, t) => s + (t.rule_violations?.length || 0), 0);
  const discipline = Math.round(Math.max(0, 100 - (violations / trades.length) * 40));
  const rrTrades = trades.filter(t => t.risk_reward_ratio);
  const avgRR = rrTrades.length ? parseFloat((rrTrades.reduce((s, t) => s + t.risk_reward_ratio, 0) / rrTrades.length).toFixed(2)) : 0;
  const hasSL = trades.filter(t => t.stop_loss != null).length;
  const riskMgmt = Math.round((hasSL / trades.length) * 60 + Math.min(40, avgRR * 15));
  const badCount = trades.filter(t => ["FOMO","Revenge","Anxious","Frustrated","Fearful"].includes(t.emotional_state)).length;
  const psychology = Math.round(Math.max(0, 100 - (badCount / trades.length) * 60));
  const equity = parseFloat(trades.reduce((s, t) => s + (t.profit_loss || 0), 0).toFixed(2));
  return { winRate, discipline, avgRR, riskMgmt, psychology, equity };
}

const PERIODS = ["Last 30 Days", "Last 60 Days", "Last 90 Days"];

const METRICS = [
  { key: "winRate", label: "Win Rate", color: "#3b82f6", format: v => `${v}%` },
  { key: "discipline", label: "Discipline", color: "#22c55e", format: v => `${v}` },
  { key: "avgRR", label: "Avg RR", color: "#f59e0b", format: v => `${v}R` },
  { key: "riskMgmt", label: "Risk Mgmt", color: "#a855f7", format: v => `${v}` },
  { key: "psychology", label: "Psychology", color: "#ec4899", format: v => `${v}` },
  { key: "equity", label: "Equity", color: "#06b6d4", format: v => `${v >= 0 ? "+" : ""}$${v}` },
];

function MiniSparkline({ data, color }) {
  if (data.length < 2) return <div className="w-16 h-6 bg-secondary/30 rounded" />;
  return (
    <div className="w-16 h-6">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.map((v, i) => ({ v, i }))}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Section6GrowthTimeline({ trades }) {
  const [period, setPeriod] = useState("Last 30 Days");

  const days = period === "Last 30 Days" ? 30 : period === "Last 60 Days" ? 60 : 90;
  const cutoffNow = subDays(new Date(), 0);
  const cutoffCurr = subDays(new Date(), days);
  const cutoffPrev = subDays(new Date(), days * 2);

  const currTrades = trades.filter(t => t.trade_date && isAfter(new Date(t.trade_date), cutoffCurr));
  const prevTrades = trades.filter(t => t.trade_date && isAfter(new Date(t.trade_date), cutoffPrev) && !isAfter(new Date(t.trade_date), cutoffCurr));

  const curr = computePeriodStats(currTrades);
  const prev = computePeriodStats(prevTrades);

  // Build simple sparklines per metric (weekly buckets)
  const buildSparkline = (key) => {
    const sorted = [...currTrades].sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date));
    const buckets = [];
    for (let i = 0; i < 4; i++) {
      const chunk = sorted.slice(Math.floor(i / 4 * sorted.length), Math.floor((i + 1) / 4 * sorted.length));
      if (chunk.length) {
        const s = computePeriodStats(chunk);
        buckets.push(s[key]);
      }
    }
    return buckets;
  };

  const prevWeakness = Object.entries(prev).filter(([k]) => k !== "equity").sort(([,a],[,b]) => a - b)[0];
  const currWeakness = Object.entries(curr).filter(([k]) => k !== "equity").sort(([,a],[,b]) => a - b)[0];

  const aiInsight = currTrades.length > 5
    ? `You are improving across all key areas. Keep focusing on high-impact actions to maintain this momentum.`
    : "Log more trades to unlock your Growth Timeline.";

  return (
    <div className="bg-card/50 border border-border/60 rounded-2xl p-5">
      <SectionHeader number={6} title="Growth Timeline" subtitle="Your evolution over time."
        right={
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="text-xs bg-secondary border border-border rounded-lg px-2 py-1 text-foreground">
            {PERIODS.map(p => <option key={p}>{p}</option>)}
          </select>
        }
      />
      {/* Metrics grid */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
        {METRICS.map(m => {
          const delta = curr[m.key] - prev[m.key];
          const isPos = delta >= 0;
          return (
            <div key={m.key} className="text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">{m.label}</p>
              <p className="text-sm font-black" style={{ color: m.color }}>{m.format(curr[m.key])}</p>
              <MiniSparkline data={buildSparkline(m.key)} color={m.color} />
              {prev[m.key] !== undefined && (
                <p className={cn("text-[9px] mt-0.5", isPos ? "text-emerald-500" : "text-destructive")}>
                  {isPos ? "↑" : "↓"} {Math.abs(m.key === "avgRR" ? delta.toFixed(2) : Math.round(delta))}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* 30 days ago vs today */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/50">
          <p className="text-[10px] text-muted-foreground mb-2">30 Days Ago</p>
          {prevWeakness && <><p className="text-[10px] text-muted-foreground">Biggest Weakness:</p><p className="text-xs font-bold capitalize">{prevWeakness[0]}</p><p className="text-[10px] text-muted-foreground">Score: {typeof prevWeakness[1] === "number" ? Math.round(prevWeakness[1]) : prevWeakness[1]}</p></>}
        </div>
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/50">
          <p className="text-[10px] text-muted-foreground mb-2">Today</p>
          {currWeakness && <><p className="text-[10px] text-muted-foreground">Biggest Weakness:</p><p className="text-xs font-bold capitalize">{currWeakness[0]}</p><p className="text-[10px] text-muted-foreground">Score: {typeof currWeakness[1] === "number" ? Math.round(currWeakness[1]) : currWeakness[1]}</p></>}
        </div>
        <div className="p-3 rounded-xl bg-primary/8 border border-primary/20">
          <p className="text-[10px] font-semibold text-primary mb-1">✦ AI Insight</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{aiInsight}</p>
        </div>
      </div>
    </div>
  );
}