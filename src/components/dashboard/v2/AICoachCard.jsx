import React, { useState, useMemo } from "react";
import { Sparkles, ArrowRight, TrendingUp, TrendingDown, Minus, AlertTriangle, Star, Brain, Shield, BarChart2 } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

function buildInsights(stats, trades) {
  const insights = [];
  const total = trades.length;
  if (!total) return [{
    type: "BIGGEST EDGE", icon: "🎯", impact: "LOW IMPACT",
    headline: "Start logging trades",
    body: "Log your first trades to unlock personalized AI coaching.",
    trend: "stable", confidence: 0, basedOn: "0 trades",
  }];

  // Biggest edge: best session
  const sessionMap = {};
  trades.filter(t => t.session).forEach(t => {
    if (!sessionMap[t.session]) sessionMap[t.session] = { wins: 0, total: 0, pl: 0 };
    sessionMap[t.session].total++;
    if (t.result === "Win") sessionMap[t.session].wins++;
    sessionMap[t.session].pl += t.profit_loss || 0;
  });
  const bestSession = Object.entries(sessionMap).sort(([, a], [, b]) => b.pl - a.pl)[0];
  if (bestSession) {
    const [name, s] = bestSession;
    const totalPL = trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
    const pct = totalPL > 0 ? Math.round((s.pl / totalPL) * 100) : 0;
    insights.push({
      type: "BIGGEST EDGE", icon: "🎯", impact: "HIGH IMPACT",
      headline: `${name} Session`,
      body: `${pct}% of your profits come from ${name} Session trades.`,
      trend: "improving", confidence: Math.min(95, 50 + s.total * 2), basedOn: `${total} trades`,
    });
  }

  // Biggest leak: after consecutive losses
  let maxConsecLoss = 0, cur = 0;
  let lossAfterLoss = 0, lossAfterLossTotal = 0;
  [...trades].sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date)).forEach(t => {
    if (t.result === "Loss") { cur++; maxConsecLoss = Math.max(maxConsecLoss, cur); }
    else { cur = 0; }
    if (cur >= 2) { lossAfterLossTotal++; if (t.result === "Loss") lossAfterLoss++; }
  });
  if (lossAfterLossTotal > 3) {
    const pct = Math.round((lossAfterLoss / lossAfterLossTotal) * 100);
    insights.push({
      type: "BIGGEST LEAK", icon: "⚠️", impact: "HIGH IMPACT",
      headline: `Overtrading After Losses`,
      body: `${pct}% of your losses occur after 2 consecutive losing trades.`,
      trend: "worse", confidence: Math.min(90, 40 + lossAfterLossTotal * 3), basedOn: `${total} trades`,
    });
  }

  // Best setup
  const setupMap = {};
  trades.filter(t => t.strategy).forEach(t => {
    if (!setupMap[t.strategy]) setupMap[t.strategy] = { wins: 0, total: 0, rrs: [] };
    setupMap[t.strategy].total++;
    if (t.result === "Win") setupMap[t.strategy].wins++;
    if (t.risk_reward_ratio) setupMap[t.strategy].rrs.push(t.risk_reward_ratio);
  });
  const bestSetup = Object.entries(setupMap).filter(([, s]) => s.total >= 3)
    .sort(([, a], [, b]) => (b.wins / b.total) - (a.wins / a.total))[0];
  if (bestSetup) {
    const [name, s] = bestSetup;
    const wr = Math.round((s.wins / s.total) * 100);
    const avgRR = s.rrs.length ? (s.rrs.reduce((a, b) => a + b, 0) / s.rrs.length).toFixed(1) : "—";
    insights.push({
      type: "BEST SETUP", icon: "⭐", impact: "HIGH IMPACT",
      headline: name,
      body: `${wr}% Win Rate · ${avgRR} Average RR`,
      trend: "improving", confidence: Math.min(92, 50 + s.total * 2), basedOn: `${s.total} trades`,
    });
  }

  // Psychology insight
  const emotionMap = {};
  trades.filter(t => t.emotional_state && t.result).forEach(t => {
    if (!emotionMap[t.emotional_state]) emotionMap[t.emotional_state] = { wins: 0, total: 0 };
    emotionMap[t.emotional_state].total++;
    if (t.result === "Win") emotionMap[t.emotional_state].wins++;
  });
  const bestEmotion = Object.entries(emotionMap).filter(([, s]) => s.total >= 2)
    .sort(([, a], [, b]) => (b.wins / b.total) - (a.wins / a.total))[0];
  if (bestEmotion) {
    const [emotion, s] = bestEmotion;
    const wr = Math.round((s.wins / s.total) * 100);
    insights.push({
      type: "PSYCHOLOGY INSIGHT", icon: "🧠", impact: "MEDIUM IMPACT",
      headline: `${emotion} State`,
      body: `You perform best when ${emotion.toLowerCase()}. Win rate: ${wr}%.`,
      trend: "stable", confidence: Math.min(85, 50 + s.total * 3), basedOn: `${total} trades`,
    });
  }

  // Risk insight
  if (stats.avgRR > 0) {
    insights.push({
      type: "RISK INSIGHT", icon: "🛡️", impact: "MEDIUM IMPACT",
      headline: `Average RR: ${stats.avgRR}R`,
      body: stats.avgRR >= 2 ? `Your RR ratio is excellent. Keep targeting ${stats.avgRR}R+.` : `Targeting 2R minimum could increase profitability by ~${Math.round((2 - stats.avgRR) * 20)}%.`,
      trend: stats.avgRR >= 2 ? "improving" : "worse", confidence: Math.min(88, 50 + total), basedOn: `${total} trades`,
    });
  }

  if (!insights.length) {
    insights.push({
      type: "GETTING STARTED", icon: "📈", impact: "LOW IMPACT",
      headline: "Build your trading history",
      body: "Log at least 10 trades to unlock personalized coaching insights.",
      trend: "stable", confidence: 0, basedOn: `${total} trades`,
    });
  }

  return insights;
}

const impactColors = {
  "HIGH IMPACT": "bg-destructive/15 text-destructive border-destructive/30",
  "MEDIUM IMPACT": "bg-warning/15 text-warning border-warning/30",
  "LOW IMPACT": "bg-secondary text-muted-foreground border-border/50",
};

const trendConfig = {
  improving: { icon: TrendingUp, color: "text-emerald-500", label: "↑ Improving" },
  worse: { icon: TrendingDown, color: "text-destructive", label: "↓ Getting Worse" },
  stable: { icon: Minus, color: "text-muted-foreground", label: "→ Stable" },
};

export default function AICoachCard({ stats, trades = [] }) {
  const insights = useMemo(() => buildInsights(stats, trades), [trades, stats]);
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * Math.max(1, insights.length)));

  const safeIdx = Math.min(idx, insights.length - 1);
  const insight = insights[safeIdx];
  const trend = trendConfig[insight.trend] || trendConfig.stable;
  const TrendIcon = trend.icon;

  return (
    <div className="bg-card rounded-2xl border border-primary/20 shadow-sm p-5 flex flex-col gap-3 h-full"
      style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(217 85% 50% / 0.05) 100%)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">SynthEdge AI Coach</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">{safeIdx + 1} of {insights.length}</span>
          <div className="flex gap-1">
            <button onClick={() => setIdx(i => (i - 1 + insights.length) % insights.length)}
              className="w-5 h-5 rounded flex items-center justify-center bg-secondary/60 hover:bg-secondary text-muted-foreground text-xs">‹</button>
            <button onClick={() => setIdx(i => (i + 1) % insights.length)}
              className="w-5 h-5 rounded flex items-center justify-center bg-secondary/60 hover:bg-secondary text-muted-foreground text-xs">›</button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", impactColors[insight.impact])}>
          {insight.impact}
        </span>
      </div>

      <div className="flex-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{insight.icon} {insight.type}</p>
        <h4 className="text-base font-bold mt-1 mb-1.5">{insight.headline}</h4>
        <p className="text-sm text-muted-foreground leading-relaxed">{insight.body}</p>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <TrendIcon className={cn("w-3 h-3", trend.color)} />
            <span className={cn("text-[10px] font-semibold", trend.color)}>{trend.label}</span>
          </div>
          {insight.confidence > 0 && (
            <p className="text-[10px] text-muted-foreground">Confidence: {insight.confidence}% · {insight.basedOn}</p>
          )}
        </div>
        <Link to="/assistant" className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
          View Full Insight <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}