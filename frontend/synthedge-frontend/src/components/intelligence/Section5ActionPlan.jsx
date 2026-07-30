import React, { useState } from "react";
import { CheckCircle2, Circle, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import SectionHeader from "./SectionHeader";

function generateActions(stats, trades) {
  const actions = [];
  const badEmotions = ["FOMO","Revenge","Anxious","Frustrated","Fearful"];
  const badCount = trades.filter(t => badEmotions.includes(t.emotional_state)).length;

  if (stats.bestSetup) actions.push(`Trade ${stats.bestSetup.name} setups only`);
  if (stats.bestSession) actions.push(`Focus on ${stats.bestSession.name} Session trades`);
  actions.push("Risk maximum 1% per trade");

  const sorted = [...trades].sort((a,b) => new Date(a.trade_date)-new Date(b.trade_date));
  let cur = 0, afterLoss = 0, afterLossLoss = 0;
  sorted.forEach(t => {
    if (cur >= 2) { afterLoss++; if (t.result === "Loss") afterLossLoss++; }
    if (t.result === "Loss") cur++; else cur = 0;
  });
  if (afterLoss > 3 && afterLossLoss / afterLoss > 0.4) actions.push("Stop after 2 consecutive losses");

  if (stats.bestSetup) actions.push(`Wait for ${stats.bestSetup.name} confirmation before entry`);
  actions.push("Complete journal after every trade");
  if (badCount > trades.length * 0.15) actions.push("Meditate 5 minutes before trading sessions");
  if (stats.avgRR < 2) actions.push("Target minimum 2:1 RR on all trades");

  return actions.slice(0, 6);
}

function getPotentialImprovement(stats, trades) {
  const leak = trades.filter(t => t.result === "Loss" && t.profit_loss).reduce((s, t) => s + Math.abs(t.profit_loss), 0);
  const potential = Math.round(leak * 0.4 / 10) * 10;
  return Math.max(potential, 80);
}

export default function Section5ActionPlan({ stats, trades }) {
  const actions = generateActions(stats, trades);
  const [checked, setChecked] = useState(new Set());
  const potential = getPotentialImprovement(stats, trades);
  const conf = Math.min(95, 50 + trades.length);
  const toggle = (i) => setChecked(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <div className="bg-card/50 border border-border/60 rounded-2xl p-5" id="action-plan">
      <SectionHeader number={5} title="AI Coach Action Plan" subtitle="Your personalized plan for the next 7 days." />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Checklist */}
        <div className="md:col-span-2">
          <p className="text-xs font-semibold text-foreground mb-3">This Week's Action Plan</p>
          <div className="space-y-2">
            {actions.map((action, i) => (
              <button key={i} onClick={() => toggle(i)}
                className={cn("w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all text-xs",
                  checked.has(i)
                    ? "bg-emerald-500/8 border-emerald-500/25 text-muted-foreground"
                    : "bg-secondary/20 border-border/40 hover:border-primary/30 text-foreground"
                )}>
                {checked.has(i)
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  : <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                }
                <span className={cn("font-medium", checked.has(i) && "line-through")}>{action}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-primary/8 border border-primary/20">
            <Lightbulb className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-semibold text-primary">AI Coaching Tip</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Following a plan removes emotion and compounds results. Discipline today creates freedom tomorrow.</p>
            </div>
          </div>
        </div>
        {/* Potential improvement */}
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-xl bg-emerald-500/8 border border-emerald-500/20 text-center">
            <p className="text-xs text-muted-foreground mb-1">Potential Improvement</p>
            <p className="text-3xl font-black text-emerald-400">+${potential}</p>
            <p className="text-xs text-muted-foreground mt-1">per month</p>
          </div>
          <div className="p-3 rounded-xl bg-secondary/30 border border-border/50 space-y-1.5">
            <p className="text-[10px] text-muted-foreground">Confidence: <span className="text-foreground font-bold">{conf}%</span></p>
            <p className="text-[10px] text-muted-foreground">Based on {trades.length} trades</p>
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mt-1">
              <div className="h-full bg-primary rounded-full" style={{ width: `${conf}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}