import React from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

function generateInsight(stats, trades) {
  const insights = [];

  if (stats.bestSetup && stats.total >= 5) {
    const setupWR = stats.bestSetup.winRate;
    const overallWR = stats.winRate;
    const diff = (setupWR - overallWR).toFixed(0);
    if (diff > 0) {
      insights.push({
        headline: `Your ${stats.bestSetup.name} setups outperform all others by ${diff}%.`,
        tips: [
          `Focus on ${stats.bestSetup.name} exclusively`,
          "Reduce trades outside this setup",
          "Track this setup's patterns closely",
        ],
        improvement: `+${Math.round(diff * 1.5)}%`,
      });
    }
  }

  if (stats.bestSession) {
    const s = stats.bestSession;
    const wr = ((s.wins / s.total) * 100).toFixed(0);
    insights.push({
      headline: `Your win rate is highest during ${s.name} Session (${wr}%).`,
      tips: [
        `Prioritize ${s.name} session trades`,
        "Avoid trading outside your best session",
        "Pre-plan setups before session opens",
      ],
      improvement: `+${Math.round(s.pl)}`,
    });
  }

  if (stats.avgRR > 0) {
    insights.push({
      headline: `Your average RR is ${stats.avgRR}. ${stats.avgRR >= 2 ? "Excellent risk management." : "Consider targeting higher rewards."}`,
      tips: [
        stats.avgRR < 2 ? "Aim for minimum 2:1 RR per trade" : "Maintain your disciplined RR approach",
        "Review trades where you cut profits early",
        "Set TP before entering a trade",
      ],
      improvement: stats.avgRR < 2 ? "+$200/mo" : "Sustain edge",
    });
  }

  if (!insights.length) {
    insights.push({
      headline: "Log more trades to unlock personalized AI insights.",
      tips: [
        "Tag each trade with a setup",
        "Rate your execution after each trade",
        "Note your emotional state",
      ],
      improvement: "Unlock soon",
    });
  }

  return insights[trades.length % insights.length] || insights[0];
}

export default function AIInsightCard({ stats, trades = [] }) {
  const insight = generateInsight(stats, trades);

  return (
    <div className="bg-card rounded-2xl border border-primary/20 shadow-sm p-5 flex flex-col gap-3 h-full"
      style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(217 85% 50% / 0.05) 100%)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">SynthEdge AI Insight</h3>
          <span className="text-[10px] px-2 py-0.5 bg-primary text-primary-foreground rounded-full font-bold">New</span>
        </div>
        <Sparkles className="w-4 h-4 text-primary" />
      </div>

      <p className="text-sm text-foreground font-medium leading-relaxed">{insight.headline}</p>

      <div className="space-y-1.5 flex-1">
        {insight.tips.map((tip, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <span className="text-primary text-[10px]">✓</span>
            </div>
            {tip}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <div>
          <p className="text-[10px] text-muted-foreground">Potential improvement</p>
          <p className="text-sm font-bold text-emerald-600">{insight.improvement}</p>
        </div>
        <Link to="/assistant" className="flex items-center gap-1 text-xs text-primary font-medium hover:underline">
          View All Insights <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}