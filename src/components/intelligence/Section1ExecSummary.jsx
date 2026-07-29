import React from "react";
import { TrendingUp, AlertTriangle, Clock, DollarSign, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import SectionHeader from "./SectionHeader";

function getTraderMaturity(stats) {
  const score = stats.winRate * 0.3 + stats.disciplineScore * 0.4 + Math.min(100, stats.avgRR * 33) * 0.3;
  if (score >= 85) return { grade: "A+", color: "text-emerald-400", desc: "Elite performance. Your systems are working at a high level." };
  if (score >= 75) return { grade: "A", color: "text-emerald-500", desc: "Strong development. You are on the right path." };
  if (score >= 65) return { grade: "B+", color: "text-primary", desc: "You are on the right path. Keep building consistency." };
  if (score >= 55) return { grade: "B", color: "text-primary", desc: "Solid foundation. Focus on reducing your biggest leak." };
  if (score >= 45) return { grade: "C+", color: "text-warning", desc: "Progress is visible. Discipline and consistency are key now." };
  return { grade: "C", color: "text-warning", desc: "Building phase. Focus on journaling and following your plan." };
}

function getPotentialImprovement(stats, trades) {
  const sessionMap = {};
  trades.filter(t => t.session && t.profit_loss != null).forEach(t => {
    if (!sessionMap[t.session]) sessionMap[t.session] = { pl: 0, total: 0 };
    sessionMap[t.session].pl += t.profit_loss;
    sessionMap[t.session].total++;
  });
  const best = Object.entries(sessionMap).sort(([,a],[,b]) => b.pl - a.pl)[0];
  const worst = Object.entries(sessionMap).sort(([,a],[,b]) => a.pl - b.pl)[0];
  const leakCost = worst ? Math.abs(worst[1].pl) : 0;
  const improvement = Math.max(0, Math.round((leakCost * 0.6 + (stats.avgRR < 2 ? stats.totalPL * 0.15 : 0)) / 10) * 10);
  return improvement || Math.round(Math.abs(stats.totalPL) * 0.2 / 10) * 10 || 120;
}

function getBiggestLeak(trades) {
  const sorted = [...trades].sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date));
  let cur = 0, afterLoss = 0, afterLossLoss = 0;
  sorted.forEach(t => {
    if (cur >= 2) { afterLoss++; if (t.result === "Loss") afterLossLoss++; }
    if (t.result === "Loss") cur++;
    else cur = 0;
  });
  const pct = afterLoss > 2 ? Math.round((afterLossLoss / afterLoss) * 100) : null;
  const fomoTrades = trades.filter(t => t.emotional_state === "FOMO").length;
  const revengeCount = trades.filter(t => t.emotional_state === "Revenge").length;
  if (pct && pct > 50) return { label: "Overtrading After Losses", detail: `${pct}% of losses occur after 2 consecutive losing trades.`, insight: "Fix this first to stop unnecessary losses." };
  if (revengeCount > trades.length * 0.1) return { label: "Revenge Trading", detail: `${revengeCount} revenge trades detected.`, insight: "Step away after consecutive losses. Never trade with emotions." };
  if (fomoTrades > trades.length * 0.15) return { label: "FOMO Entries", detail: `${Math.round((fomoTrades / trades.length) * 100)}% of trades taken out of FOMO.`, insight: "Wait for your setup. FOMO is costing you your edge." };
  return { label: "Early Entries", detail: "You tend to enter before your setup confirms.", insight: "Wait for full confirmation before executing." };
}

export default function Section1ExecSummary({ stats, trades }) {
  if (!trades.length) return null;
  const maturity = getTraderMaturity(stats);
  const potential = getPotentialImprovement(stats, trades);
  const leak = getBiggestLeak(trades);
  const totalPL = trades.reduce((s, t) => s + (t.profit_loss || 0), 0);
  const bestSessionPct = stats.bestSession && totalPL > 0
    ? Math.round((stats.bestSession.pl / totalPL) * 100) : 0;
  const bestSetup = stats.bestSetup;
  const conf = Math.min(95, 50 + trades.length);

  const cards = [
    {
      icon: "🎯", color: "border-emerald-500/30 bg-emerald-500/5", label: "Strongest Edge",
      title: bestSetup ? bestSetup.name : stats.bestSession ? `${stats.bestSession.name} Session` : "Building Edge",
      detail: bestSetup ? `${bestSetup.winRate}% win rate · ${bestSetup.rrs?.length ? (bestSetup.rrs.reduce((a,b)=>a+b,0)/bestSetup.rrs.length).toFixed(1) : "—"}R Avg RR` : `${Math.round(stats.winRate)}% WR overall`,
      insight: "Focus more on what already works.",
    },
    {
      icon: "⚠️", color: "border-red-500/30 bg-red-500/5", label: "Biggest Leak",
      title: leak.label, detail: leak.detail, insight: leak.insight,
    },
    {
      icon: "🕐", color: "border-primary/30 bg-primary/5", label: "Strongest Session",
      title: stats.bestSession ? `${stats.bestSession.name} Session` : "Session TBD",
      detail: bestSessionPct > 0 ? `${bestSessionPct}% of profits generated here.` : "Tag your trades with sessions to unlock.",
      insight: "This is your best opportunity window.",
    },
    {
      icon: "📈", color: "border-emerald-500/30 bg-emerald-500/5", label: "Potential Monthly Improvement",
      title: `+$${potential}`, detail: "Estimated improvement if high-impact changes are implemented.",
      insight: "This is your potential monthly gain.",
    },
  ];

  return (
    <div className="bg-card/50 border border-border/60 rounded-2xl p-5">
      <SectionHeader number={1} title="AI Executive Summary" subtitle="The big picture. What matters most right now."
        right={<span className="text-[10px] text-primary cursor-pointer hover:underline">What This Means</span>}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {cards.map((c, i) => (
          <div key={i} className={cn("rounded-xl border p-3.5 flex flex-col gap-2", c.color)}>
            <span className="text-lg">{c.icon}</span>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{c.label}</p>
            <p className={cn("font-black leading-tight", i === 3 ? "text-2xl text-emerald-400" : "text-sm")}>{c.title}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{c.detail}</p>
            <div className="mt-auto pt-2 border-t border-white/10">
              <p className="text-[11px] text-muted-foreground/80 italic">{c.insight}</p>
            </div>
          </div>
        ))}
        {/* Trader Maturity */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 flex flex-col items-center gap-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Trader Maturity</p>
          <div className={cn("text-4xl font-black", maturity.color)}>{maturity.grade}</div>
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">{maturity.desc}</p>
          <p className="text-[10px] text-muted-foreground">Confidence: {conf}%</p>
          <p className="text-[10px] text-muted-foreground">Based on {trades.length} trades</p>
        </div>
      </div>
    </div>
  );
}