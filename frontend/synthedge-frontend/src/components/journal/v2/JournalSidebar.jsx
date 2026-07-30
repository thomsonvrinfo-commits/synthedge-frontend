import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const SESSIONS = ["London", "New York", "Asian", "Sydney", "Overlap"];
const SESSION_ICONS = { London: "☀️", "New York": "🌙", Asian: "☁️", Sydney: "🌅", Overlap: "🔄" };

export default function JournalSidebar({ stats, trades }) {
  const wins = stats.wins || 0;
  const losses = stats.losses || 0;
  const be = stats.be || 0;

  const donutData = [
    { name: "Wins", value: wins, color: "#22c55e" },
    { name: "Losses", value: losses, color: "#ef4444" },
    { name: "Breakeven", value: be, color: "#f59e0b" },
  ].filter(d => d.value > 0);

  // Best setup
  const setupMap = stats.setupMap || {};
  const bestSetup = Object.entries(setupMap).filter(([,s]) => s.total >= 2)
    .sort(([,a],[,b]) => (b.wins/b.total)-(a.wins/a.total))[0];

  // Session bars
  const sessionEntries = SESSIONS.map(s => {
    const d = stats.sessionMap?.[s];
    if (!d) return null;
    return { name: s, winRate: Math.round((d.wins / d.total) * 100), pl: d.pl, total: d.total };
  }).filter(Boolean).sort((a,b) => b.winRate - a.winRate);
  const maxWR = Math.max(...sessionEntries.map(s => s.winRate), 1);

  // AI quick insight
  const aiInsight = (() => {
    if (!trades.length) return "Log trades to unlock AI insights.";
    if (bestSetup) {
      const [name, s] = bestSetup;
      const wr = Math.round((s.wins / s.total) * 100);
      const bestS = sessionEntries[0];
      if (bestS) return `Your ${name} trades during ${bestS.name} session have the highest win rate (${wr}%). Focus more on these setups.`;
      return `Your ${name} setups have a ${wr}% win rate. Focus on trading them more frequently.`;
    }
    return "Tag your trades with setups and sessions to unlock AI insights.";
  })();

  return (
    <div className="space-y-3 sticky top-4">
      {/* Performance Overview */}
      <div className="bg-card border border-border/60 rounded-2xl p-4">
        <p className="text-xs font-semibold mb-3">Performance Overview</p>
        {donutData.length > 0 ? (
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={donutData} cx="50%" cy="50%" innerRadius={24} outerRadius={36} dataKey="value" strokeWidth={0}>
                  {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie></PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 flex-1">
              {donutData.map(d => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                    <span className="text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="font-bold" style={{ color: d.color }}>{d.value}</span>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">{wins + losses + be} total trades</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">No trades yet</p>
        )}
      </div>

      {/* Best Setup */}
      {bestSetup && (
        <div className="bg-card border border-border/60 rounded-2xl p-4">
          <p className="text-xs font-semibold mb-2">Best Setup</p>
          <p className="text-lg font-black text-primary">{bestSetup[0]}</p>
          <div className="space-y-1 mt-2 text-xs text-muted-foreground">
            <div className="flex justify-between"><span>Win Rate</span><span className="text-emerald-500 font-semibold">{Math.round((bestSetup[1].wins/bestSetup[1].total)*100)}%</span></div>
            <div className="flex justify-between"><span>Avg RR</span><span className="font-semibold">{bestSetup[1].rrs?.length ? (bestSetup[1].rrs.reduce((a,b)=>a+b,0)/bestSetup[1].rrs.length).toFixed(1) : "—"}R</span></div>
            <div className="flex justify-between"><span>Net P/L</span><span className={cn("font-semibold", bestSetup[1].pl >= 0 ? "text-emerald-500" : "text-destructive")}>{bestSetup[1].pl >= 0 ? "+" : ""}${(bestSetup[1].pl || 0).toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Trades</span><span>{bestSetup[1].total}</span></div>
          </div>
        </div>
      )}

      {/* Session Performance */}
      {sessionEntries.length > 0 && (
        <div className="bg-card border border-border/60 rounded-2xl p-4">
          <p className="text-xs font-semibold mb-3">Session Performance</p>
          <div className="space-y-2">
            {sessionEntries.map(s => (
              <div key={s.name} className="space-y-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1">{SESSION_ICONS[s.name]} <span className="text-muted-foreground">{s.name}</span></span>
                  <span className="font-semibold text-emerald-500">{s.winRate}%</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${(s.winRate / maxWR) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Quick Insight */}
      <div className="bg-card border border-primary/20 rounded-2xl p-4"
        style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(217 85% 50% / 0.05) 100%)" }}>
        <p className="text-xs font-semibold mb-2">✦ AI Quick Insight</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{aiInsight}</p>
        <Link to="/assistant" className="flex items-center gap-1 text-xs text-primary font-semibold mt-3 hover:underline">
          View Full Intelligence <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}