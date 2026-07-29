import React from "react";
import { cn } from "@/lib/utils";
import SectionHeader from "./SectionHeader";
import AIInsight from "./AIInsight";

const SESSIONS = ["London", "New York", "Asian", "Sydney", "Overlap"];

export default function Section2PerformanceIntel({ stats, trades }) {
  const setupEntries = Object.entries(stats.setupMap || {})
    .map(([name, s]) => ({
      name, total: s.total, wins: s.wins,
      winRate: parseFloat(((s.wins / s.total) * 100).toFixed(1)),
      avgRR: s.rrs?.length ? parseFloat((s.rrs.reduce((a,b)=>a+b,0)/s.rrs.length).toFixed(2)) : null,
      pl: parseFloat((s.pl || 0).toFixed(2)),
    }))
    .sort((a, b) => b.winRate - a.winRate);

  const sessionEntries = SESSIONS.map(session => {
    const s = stats.sessionMap?.[session];
    if (!s) return null;
    return {
      name: session, total: s.total, wins: s.wins,
      winRate: parseFloat(((s.wins / s.total) * 100).toFixed(1)),
      avgRR: s.rrs?.length ? parseFloat((s.rrs.reduce((a,b)=>a+b,0)/s.rrs.length).toFixed(2)) : null,
      pl: parseFloat((s.pl || 0).toFixed(2)),
    };
  }).filter(Boolean).sort((a,b) => b.pl - a.pl);

  const topSetup = setupEntries[0];
  const topSession = sessionEntries[0];
  const totalPL = trades.reduce((s,t) => s + (t.profit_loss || 0), 0);
  const sessionPct = topSession && totalPL > 0 ? Math.round((topSession.pl / totalPL) * 100) : null;

  const setupInsight = topSetup
    ? `${topSetup.name} setups outperform all others by ${Math.round(topSetup.winRate - (stats.winRate || 0))}% in win rate. Trade them more frequently.`
    : "Tag your trades with strategies to unlock setup intelligence.";
  const sessionInsight = sessionPct
    ? `${sessionPct}% of profits come from ${topSession?.name}. Increase your ${topSession?.name} focus.`
    : "Tag your trades with sessions to unlock session intelligence.";

  return (
    <div className="bg-card/50 border border-border/60 rounded-2xl p-5">
      <SectionHeader number={2} title="Performance Intelligence" subtitle="What creates your best performance." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Setup Intelligence */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-foreground">Setup Intelligence</p>
            <button className="text-[10px] text-primary hover:underline">View Full Breakdown →</button>
          </div>
          {setupEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Tag your trades with strategies to unlock setup intelligence.</p>
          ) : (
            <>
              <div className="grid grid-cols-5 gap-1 px-1 mb-1">
                {["Setup","Win Rate","Avg RR","Net P/L","Trades"].map(h => (
                  <span key={h} className="text-[9px] text-muted-foreground font-medium">{h}</span>
                ))}
              </div>
              <div className="space-y-0.5">
                {setupEntries.slice(0,6).map(s => (
                  <div key={s.name} className="grid grid-cols-5 gap-1 px-1 py-1.5 rounded-lg hover:bg-secondary/30 transition-colors">
                    <span className="text-[10px] font-medium truncate">{s.name}</span>
                    <span className={cn("text-[10px] font-mono", s.winRate >= 60 ? "text-emerald-500" : s.winRate >= 45 ? "text-warning" : "text-destructive")}>{s.winRate}%</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{s.avgRR ?? "—"}</span>
                    <span className={cn("text-[10px] font-mono font-semibold", s.pl >= 0 ? "text-emerald-500" : "text-destructive")}>{s.pl >= 0 ? "+" : ""}${s.pl}</span>
                    <span className="text-[10px] text-muted-foreground">{s.total}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <AIInsight text={setupInsight} />
        </div>
        {/* Session Intelligence */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-foreground">Session Intelligence</p>
            <button className="text-[10px] text-primary hover:underline">View Full Breakdown →</button>
          </div>
          {sessionEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Tag your trades with sessions to unlock session intelligence.</p>
          ) : (
            <>
              <div className="grid grid-cols-5 gap-1 px-1 mb-1">
                {["Session","Win Rate","Net Profit","Avg RR","Trades"].map(h => (
                  <span key={h} className="text-[9px] text-muted-foreground font-medium">{h}</span>
                ))}
              </div>
              <div className="space-y-0.5">
                {sessionEntries.map(s => (
                  <div key={s.name} className="grid grid-cols-5 gap-1 px-1 py-1.5 rounded-lg hover:bg-secondary/30 transition-colors">
                    <span className="text-[10px] font-medium truncate">{s.name}</span>
                    <span className={cn("text-[10px] font-mono", s.winRate >= 60 ? "text-emerald-500" : s.winRate >= 45 ? "text-warning" : "text-destructive")}>{s.winRate}%</span>
                    <span className={cn("text-[10px] font-mono font-semibold", s.pl >= 0 ? "text-emerald-500" : "text-destructive")}>{s.pl >= 0 ? "+" : ""}${s.pl}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{s.avgRR ?? "—"}</span>
                    <span className="text-[10px] text-muted-foreground">{s.total}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <AIInsight text={sessionInsight} />
        </div>
      </div>
    </div>
  );
}