import React, { useMemo } from "react";
import { Info, Trophy, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const SESSION_META = {
  London: { emoji: "🇬🇧", hours: "07:00 AM – 10:00 AM" },
  "New York": { emoji: "🗽", hours: "01:00 PM – 04:00 PM" },
  Asian: { emoji: "🌏", hours: "11:00 PM – 02:00 AM" },
  Sydney: { emoji: "🇦🇺", hours: "09:00 PM – 12:00 AM" },
  Overlap: { emoji: "🔄", hours: "01:00 PM – 03:00 PM" },
};

function sessionScore(s, maxPL, maxWR, maxRR) {
  const plNorm = maxPL > 0 ? (s.pl / maxPL) * 40 : 0;
  const wrNorm = maxWR > 0 ? (s.winRate / maxWR) * 30 : 0;
  const rrNorm = maxRR > 0 ? (s.avgRR / maxRR) * 20 : 0;
  const sampleNorm = Math.min(s.total / 20, 1) * 10;
  return plNorm + wrNorm + rrNorm + sampleNorm;
}

function MiniSparkline({ data, isPos }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 64, H = 24;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  }).join(" ");
  const color = isPos ? "#22c55e" : "#ef4444";
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function SessionPerformanceV2({ trades = [] }) {
  const sessionData = useMemo(() => {
    const map = {};
    trades.filter(t => t.session).forEach(t => {
      if (!map[t.session]) map[t.session] = { wins: 0, total: 0, pl: 0, rrs: [], cumPL: [] };
      map[t.session].total++;
      if (t.result === "Win") map[t.session].wins++;
      map[t.session].pl += t.pl ?? t.profit_loss ?? 0;
      const rrVal = t.rr ?? t.risk_reward_ratio;
      if (rrVal != null) map[t.session].rrs.push(rrVal);
      map[t.session].cumPL.push(map[t.session].pl);
    });
    return map;
  }, [trades]);

  const totalPL = Object.values(sessionData).reduce((s, v) => s + v.pl, 0);
  const sessions = Object.entries(sessionData).map(([name, s]) => ({
    name,
    total: s.total,
    pl: s.pl,
    winRate: s.total ? ((s.wins / s.total) * 100) : 0,
    avgRR: s.rrs.length ? s.rrs.reduce((a, b) => a + b, 0) / s.rrs.length : 0,
    pctOfPL: totalPL > 0 ? ((s.pl / totalPL) * 100) : 0,
    cumPL: s.cumPL,
    wins: s.wins,
  }));

  if (!sessions.length || trades.length < 10) {
    return (
      <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">Session Performance</h3>
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">Discover when you trade best.</p>
        </div>
        <p className="text-xs text-muted-foreground py-4 text-center">
          Trade more sessions to unlock session intelligence. (10 trades minimum)
        </p>
      </div>
    );
  }

  const maxPL = Math.max(...sessions.map(s => s.pl));
  const maxWR = Math.max(...sessions.map(s => s.winRate));
  const maxRR = Math.max(...sessions.map(s => s.avgRR));
  const ranked = [...sessions].sort((a, b) => sessionScore(b, maxPL, maxWR, maxRR) - sessionScore(a, maxPL, maxWR, maxRR));
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  // Key insight
  const multiplier = worst.pl < 0 && best.pl > 0
    ? (best.pl / Math.abs(worst.pl)).toFixed(1)
    : null;
  const keyInsight = multiplier
    ? `You are ${multiplier}× more profitable during ${best.name} Session compared to ${worst.name}.`
    : `Your win rate is highest during ${best.name} Session (${Math.round(best.winRate)}%).`;

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3">
      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">Session Performance</h3>
          <Info className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">Discover when you trade best.</p>
      </div>

      {/* Best session hero */}
      <div className="p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Trophy className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-500 uppercase">Best Session</span>
            </div>
            <h4 className="text-base font-black">{SESSION_META[best.name]?.emoji} {best.name} Session</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {best.pctOfPL > 0 ? `${Math.round(best.pctOfPL)}% of total profits generated here.` : `${Math.round(best.winRate)}% win rate — your best session.`}
            </p>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
              <span>{best.total} Trades</span>
              <span className="text-emerald-500 font-semibold">{Math.round(best.winRate)}% WR</span>
              <span>{best.avgRR.toFixed(1)}R Avg RR</span>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground max-w-[140px]">
            <p className="font-semibold text-primary">Recommendation</p>
            <p className="text-[11px] leading-relaxed">Prioritize {best.name} Session. You have the highest expectancy during these hours.</p>
          </div>
        </div>
      </div>

      {/* Ranked session list */}
      <div className="space-y-1">
        {ranked.map((s, i) => {
          const meta = SESSION_META[s.name] || { emoji: "🕐", hours: "" };
          const isBest = i === 0;
          const isWorst = i === ranked.length - 1;
          const medalEmoji = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
          const wrColor = s.winRate >= 60 ? "text-emerald-500" : s.winRate >= 40 ? "text-warning" : "text-destructive";

          return (
            <div key={s.name} className={cn(
              "flex items-center gap-3 p-2.5 rounded-xl border transition-colors",
              isBest ? "bg-emerald-500/5 border-emerald-500/20" :
              isWorst ? "bg-destructive/5 border-destructive/20" :
              "bg-secondary/20 border-border/30"
            )}>
              {/* Rank + icon */}
              <div className="flex items-center gap-1.5 w-8 flex-shrink-0">
                {medalEmoji ? <span className="text-sm">{medalEmoji}</span> : isWorst ? <AlertTriangle className="w-3.5 h-3.5 text-destructive" /> : <span className="text-xs text-muted-foreground">#{i+1}</span>}
              </div>
              {/* Session info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm">{meta.emoji}</span>
                  <span className="text-xs font-semibold truncate">{s.name}</span>
                </div>
                <span className="text-[9px] text-muted-foreground">{meta.hours}</span>
              </div>
              {/* Sparkline */}
              <MiniSparkline data={s.cumPL} isPos={s.pl >= 0} />
              {/* P/L */}
              <div className="text-right w-20 flex-shrink-0">
                <p className={cn("text-xs font-bold font-mono", s.pl >= 0 ? "text-emerald-500" : "text-destructive")}>
                  {s.pl >= 0 ? "+" : ""}${s.pl.toFixed(0)}
                </p>
                <p className="text-[9px] text-muted-foreground">{s.pctOfPL >= 0 ? "+" : ""}{Math.round(s.pctOfPL)}% of profits</p>
              </div>
              {/* Win rate */}
              <div className="w-16 flex-shrink-0">
                <p className={cn("text-xs font-bold", wrColor)}>{Math.round(s.winRate)}%</p>
                <div className="h-1 bg-secondary rounded-full overflow-hidden mt-0.5">
                  <div className={cn("h-full rounded-full", s.winRate >= 60 ? "bg-emerald-500" : s.winRate >= 40 ? "bg-warning" : "bg-destructive")}
                    style={{ width: `${s.winRate}%` }} />
                </div>
              </div>
              {/* RR */}
              <div className="w-10 flex-shrink-0">
                <p className="text-xs font-mono text-muted-foreground">{s.avgRR.toFixed(1)}R</p>
              </div>
              {/* Trades */}
              <div className="w-6 flex-shrink-0 text-right">
                <p className="text-[10px] text-muted-foreground">{s.total}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Key insight footer */}
      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-secondary/30 border border-border/40">
        <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground"><span className="text-foreground font-semibold">Key Insight</span> {keyInsight}</p>
        <span className="text-[10px] text-muted-foreground flex-shrink-0">Values in USD</span>
      </div>
    </div>
  );
}