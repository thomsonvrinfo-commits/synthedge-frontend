import React from "react";
import { cn } from "@/lib/utils";
import SectionHeader from "./SectionHeader";
import AIInsight from "./AIInsight";

const ARCHETYPES = [
  { name: "Precision Sniper", icon: "🎯", cond: (s) => s.avgRR >= 2.5 && s.winRate >= 55 },
  { name: "Risk/Reward Master", icon: "⚖️", cond: (s) => s.avgRR >= 3 },
  { name: "High Accuracy Trader", icon: "🏹", cond: (s) => s.winRate >= 65 },
  { name: "Session Specialist", icon: "🕐", cond: (s) => !!s.bestSession },
  { name: "Systematic Trader", icon: "🤖", cond: (s) => s.disciplineScore >= 80 },
  { name: "Momentum Hunter", icon: "⚡", cond: (s) => s.total >= 20 },
  { name: "Developing Trader", icon: "🌱", cond: () => true },
];

export default function Section4TradingDNA({ stats, trades }) {
  const archetype = ARCHETYPES.find(a => a.cond(stats)) || ARCHETYPES[ARCHETYPES.length - 1];
  const conf = Math.min(95, 50 + trades.length);

  const totalPL = trades.reduce((s, t) => s + (t.profit_loss || 0), 0);
  const sessionPLMap = {};
  trades.filter(t => t.session).forEach(t => {
    sessionPLMap[t.session] = (sessionPLMap[t.session] || 0) + (t.profit_loss || 0);
  });
  const bestSessionEntry = Object.entries(sessionPLMap).sort(([,a],[,b]) => b-a)[0];
  const bestSessionPct = bestSessionEntry && totalPL > 0 ? Math.round((bestSessionEntry[1] / totalPL) * 100) : null;

  const setupMap = stats.setupMap || {};
  const topSetup = Object.entries(setupMap).filter(([,s]) => s.total >= 2)
    .sort(([,a],[,b]) => (b.wins/b.total)-(a.wins/a.total))[0];

  const sorted = [...trades].sort((a,b) => new Date(a.trade_date)-new Date(b.trade_date));
  let cur = 0; let afterLossLoss = 0, afterLossTotal = 0;
  sorted.forEach(t => {
    if (cur >= 2) { afterLossTotal++; if (t.result === "Loss") afterLossLoss++; }
    if (t.result === "Loss") cur++;
    else cur = 0;
  });
  const recurringPattern = afterLossTotal > 3 && afterLossLoss / afterLossTotal > 0.5
    ? "Aggressive Entries"
    : trades.filter(t => t.emotional_state === "FOMO").length > trades.length * 0.15
    ? "FOMO Entries"
    : "Consistent Execution";

  const strategies = new Set(trades.filter(t => t.strategy).map(t => t.strategy)).size;
  const sessions = new Set(trades.filter(t => t.session).map(t => t.session)).size;
  const adaptability = strategies >= 3 && sessions >= 3 ? "High" : strategies >= 2 ? "Improving" : "Specializing";

  const dims = [
    { icon: "🌍", label: "Style Anchor", value: bestSessionEntry ? `${bestSessionEntry[0]} Specialist` : "Building Style", desc: bestSessionPct ? `You generate ${bestSessionPct}% of profits during the ${bestSessionEntry[0]} session.` : "Trade more sessions to reveal your style anchor." },
    { icon: "⚙️", label: "Setup Preference", value: topSetup ? `${topSetup[0]} Trader` : "Exploring Setups", desc: topSetup ? `Your best results consistently come from ${topSetup[0]} setups.` : "Tag more trades with strategies to unlock this." },
    { icon: "🔁", label: "Recurring Pattern", value: recurringPattern, desc: recurringPattern === "Aggressive Entries" ? "You tend to enter trades earlier than planned, especially after losses." : recurringPattern === "FOMO Entries" ? "You frequently chase trades out of FOMO." : "Your execution patterns are becoming more consistent." },
    { icon: "♟️", label: "Trader Archetype", value: archetype.name, desc: `${archetype.icon} You are selective, disciplined, and focus on high-probability setups.` },
  ];

  const aiInsight = `Your DNA shows a natural edge in ${stats.bestSetup?.name ? stats.bestSetup.name + " setups" : "selectivity"} and reward optimization. Continue refining ${recurringPattern.includes("Aggressive") || recurringPattern.includes("FOMO") ? "patience" : "consistency"} to unlock your full potential.`;

  return (
    <div className="bg-card/50 border border-border/60 rounded-2xl p-5">
      <SectionHeader number={4} title="Trading DNA" subtitle="Your trading identity and natural tendencies." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {dims.map(d => (
          <div key={d.label} className="p-3 rounded-xl bg-secondary/30 border border-border/50">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-lg">{d.icon}</span>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{d.label}</p>
            </div>
            <p className="text-xs font-bold text-primary">{d.value}</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{d.desc}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-muted-foreground">DNA Confidence: {conf}% · Based on {trades.length} trades</p>
      </div>
      <AIInsight text={aiInsight} />
    </div>
  );
}