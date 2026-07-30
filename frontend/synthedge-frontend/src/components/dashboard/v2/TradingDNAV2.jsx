import React from "react";
import { Dna, ArrowRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const ARCHETYPES = [
  {
    name: "Precision Sniper",
    icon: "🎯",
    condition: (s) => s.avgRR >= 2.5 && s.winRate >= 55,
    desc: (s) => `You focus on high-probability setups, trade selectively, and maximize reward through discipline.`,
    color: "text-primary",
  },
  {
    name: "Risk/Reward Master",
    icon: "⚖️",
    condition: (s) => s.avgRR >= 3,
    desc: (s) => `You consistently achieve superior risk-reward ratios. Your edge is letting winners run.`,
    color: "text-emerald-500",
  },
  {
    name: "High Accuracy Trader",
    icon: "🏹",
    condition: (s) => s.winRate >= 65,
    desc: (s) => `Your exceptional win rate shows strong setup identification skills.`,
    color: "text-yellow-500",
  },
  {
    name: "Session Specialist",
    icon: "🕐",
    condition: (s) => !!s.bestSession,
    desc: (s) => `You generate your best results during the ${s.bestSession?.name || "London"} Session. Session mastery is your edge.`,
    color: "text-cyan-500",
  },
  {
    name: "Systematic Trader",
    icon: "🤖",
    condition: (s) => s.disciplineScore >= 80,
    desc: (s) => `Rule-based discipline defines your trading. Your systematic approach creates consistency.`,
    color: "text-purple-500",
  },
  {
    name: "Momentum Hunter",
    icon: "⚡",
    condition: (s) => s.total >= 20,
    desc: (s) => `You adapt to market conditions and capitalize on momentum moves.`,
    color: "text-orange-500",
  },
  {
    name: "Adaptive Trader",
    icon: "🔄",
    condition: () => true,
    desc: (s) => `Your trading style continues to evolve. Keep building consistency to reveal your true archetype.`,
    color: "text-muted-foreground",
  },
];

function getArchetype(stats, trades) {
  return ARCHETYPES.find(a => a.condition(stats)) || ARCHETYPES[ARCHETYPES.length - 1];
}

function getDNAConfidence(total) {
  if (total >= 50) return { pct: Math.min(95, 60 + total), level: "High Confidence" };
  if (total >= 20) return { pct: Math.min(75, 40 + total), level: "Medium Confidence" };
  return { pct: Math.min(40, total * 2), level: "Low Confidence" };
}

function getStyleAnchor(trades, stats) {
  const sessionMap = {};
  trades.filter(t => t.session).forEach(t => {
    if (!sessionMap[t.session]) sessionMap[t.session] = { total: 0, pl: 0 };
    sessionMap[t.session].total++;
    sessionMap[t.session].pl += t.pl ?? t.profit_loss ?? 0;
  });
  const best = Object.entries(sessionMap).sort(([, a], [, b]) => b.pl - a.pl)[0];
  if (!best) return { label: "All Sessions", desc: "Develop a session specialization to sharpen your edge." };
  const totalPL = Object.values(sessionMap).reduce((s, v) => s + v.pl, 0);
  const pct = totalPL > 0 ? Math.round((best[1].pl / totalPL) * 100) : 0;
  return { label: `${best[0]} Specialist`, desc: `You generate ${pct}% of your profits during the ${best[0]} session.` };
}

function getSetupPreference(trades) {
  const setupMap = {};
  trades.filter(t => t.setup || t.strategy).forEach(t => {
    const key = t.setup || t.strategy;
    if (!setupMap[key]) setupMap[key] = { wins: 0, total: 0 };
    setupMap[key].total++;
    if (t.result === "Win") setupMap[key].wins++;
  });
  const best = Object.entries(setupMap).filter(([, s]) => s.total >= 2)
    .sort(([, a], [, b]) => (b.wins / b.total) - (a.wins / a.total))[0];
  if (!best) return { label: "Exploring Setups", desc: "Tag your trades with setups to reveal your strongest pattern." };
  return { label: `${best[0]} Trader`, desc: `Your best results consistently come from ${best[0]} setups.` };
}

function getRecurringPattern(trades) {
  const sorted = [...trades].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  let losses = 0, afterLossTotal = 0;
  sorted.forEach((t, i) => {
    if (i > 0 && sorted[i - 1].result === "Loss") {
      afterLossTotal++;
      if (t.result === "Loss") losses++;
    }
  });
  if (afterLossTotal > 3 && losses / afterLossTotal > 0.5) {
    return { label: "Aggressive Entries", desc: "You tend to enter trades earlier than planned, especially after losses." };
  }
  const fomoCount = trades.filter(t => t.emotional_state === "FOMO").length;
  if (fomoCount / trades.length > 0.2) {
    return { label: "FOMO Entries", desc: "You frequently chase trades out of fear of missing out. Build patience." };
  }
  return { label: "Consistent Execution", desc: "You show steady execution patterns. Continue building your routine." };
}

function getAdaptability(trades) {
  const strategies = new Set(trades.filter(t => t.setup || t.strategy).map(t => t.setup || t.strategy)).size;
  const sessions = new Set(trades.filter(t => t.session).map(t => t.session)).size;
  if (strategies >= 3 && sessions >= 3) return { label: "Highly Adaptive", desc: "You perform well across multiple setups and sessions." };
  if (strategies >= 2 || sessions >= 2) return { label: "Improving", desc: "Your ability to adapt across different conditions is increasing." };
  return { label: "Specializing", desc: "You're developing a focused trading style. Specialization builds mastery." };
}

export default function TradingDNAV2({ stats, trades = [] }) {
  const total = trades.length;

  if (total < 20) {
    return (
      <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Dna className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Trader DNA</h3>
        </div>
        <p className="text-xs text-muted-foreground">Your trading identity based on behavior, performance, and patterns.</p>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6">
          <p className="text-sm font-medium text-center">Trader DNA unlocks after 20 trades.</p>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${(total / 20) * 100}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">{total} / 20 trades</p>
        </div>
      </div>
    );
  }

  const archetype = getArchetype(stats, trades);
  const confidence = getDNAConfidence(total);
  const styleAnchor = getStyleAnchor(trades, stats);
  const setupPref = getSetupPreference(trades);
  const recurringPattern = getRecurringPattern(trades);
  const adaptability = getAdaptability(trades);
  const desc = archetype.desc(stats);

  const aiSummary = (() => {
    const parts = [];
    if (styleAnchor.label !== "All Sessions") parts.push(`performs best during ${styleAnchor.label.replace(" Specialist", "").toLowerCase()} sessions`);
    if (setupPref.label !== "Exploring Setups") parts.push(`using ${setupPref.label.replace(" Trader", "")} setups`);
    const challenge = recurringPattern.label === "Consistent Execution" ? "patience" : "entry discipline";
    return `You are a ${desc.split(".")[0].toLowerCase().replace("you ", "")}.${parts.length ? " Your biggest edge: " + parts.join(" and ") + "." : ""} Your long-term challenge remains ${challenge} and waiting for confirmation.`;
  })();

  return (
    <div className="bg-card rounded-2xl border border-primary/15 shadow-sm p-5 flex flex-col gap-4"
      style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(217 85% 50% / 0.04) 100%)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dna className="w-4 h-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Trader DNA</h3>
            <p className="text-[10px] text-muted-foreground">Your trading identity based on behavior, performance, and patterns.</p>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <RefreshCw className="w-2.5 h-2.5" /> Updated daily
        </span>
      </div>

      {/* Hero: Archetype */}
      <div className="flex items-start gap-4 p-3 rounded-xl bg-secondary/30 border border-border/50">
        <div className="flex-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Your Trader Archetype</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl">{archetype.icon}</span>
            <h4 className={cn("text-xl font-black", archetype.color)}>{archetype.name}</h4>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
        </div>
        <div className="text-center flex-shrink-0">
          <p className="text-[9px] text-muted-foreground">DNA CONFIDENCE</p>
          <p className={cn("text-xl font-black", archetype.color)}>{confidence.pct}%</p>
          <p className="text-[9px] text-muted-foreground">{confidence.level}</p>
          <p className="text-[9px] text-muted-foreground">Based on {total} trades</p>
        </div>
      </div>

      {/* DNA Dimensions */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { icon: "🌍", label: "Style Anchor", value: styleAnchor.label, desc: styleAnchor.desc },
          { icon: "⚙️", label: "Setup Preference", value: setupPref.label, desc: setupPref.desc },
          { icon: "🔁", label: "Recurring Pattern", value: recurringPattern.label, desc: recurringPattern.desc },
          { icon: "🔄", label: "Adaptability", value: adaptability.label, desc: adaptability.desc },
        ].map(item => (
          <div key={item.label} className="p-2.5 rounded-xl bg-secondary/30 border border-border/40">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{item.icon} {item.label}</p>
            <p className="text-xs font-bold mt-0.5 text-primary">{item.value}</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* AI Summary */}
      <div className="p-3 rounded-xl bg-primary/8 border border-primary/20">
        <p className="text-[10px] font-semibold text-primary mb-1">✦ AI DNA Summary</p>
        <p className="text-xs text-foreground leading-relaxed">{aiSummary}</p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground italic">DNA is always evolving. Keep journaling consistently.</p>
        <Link to="/assistant" className="flex items-center gap-1 text-[10px] text-primary font-semibold hover:underline">
          View Action Plan <ArrowRight className="w-2.5 h-2.5" />
        </Link>
      </div>
    </div>
  );
}