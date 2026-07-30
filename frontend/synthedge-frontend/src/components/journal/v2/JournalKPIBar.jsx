import React from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

function MiniSparkline({ data = [], color = "#22c55e" }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 52, H = 24;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`).join(" ");
  return (
    <svg width={W} height={H}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /></svg>
  );
}

function Ring({ value, max = 100, color = "#22c55e", size = 52 }) {
  const r = (size - 8) / 2, circ = 2 * Math.PI * r;
  const offset = circ - Math.min(1, value / max) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
}

export default function JournalKPIBar({ stats, trades }) {
  const winRate = stats.winRate || 0;
  const wins = stats.wins || 0;
  const losses = stats.losses || 0;
  const avgRR = stats.avgRR || 0;
  const totalPL = stats.totalPL || 0;
  const discipline = stats.disciplineScore || 0;
  const violations = stats.violationCount || 0;

  // Expectancy
  const avgWin = trades.filter(t => t.result === "Win" && t.profit_loss).reduce((s, t) => s + t.profit_loss, 0) / Math.max(wins, 1);
  const avgLoss = trades.filter(t => t.result === "Loss" && t.profit_loss).reduce((s, t) => s + t.profit_loss, 0) / Math.max(losses, 1);
  const expectancy = wins + losses > 0 ? parseFloat(((wins / (wins + losses)) * avgRR + (losses / (wins + losses)) * (avgLoss > 0 ? -avgLoss : avgLoss)).toFixed(2)) : 0;

  // Best session
  const sessionMap = {};
  trades.forEach(t => {
    if (!t.session) return;
    if (!sessionMap[t.session]) sessionMap[t.session] = { wins: 0, total: 0 };
    sessionMap[t.session].total++;
    if (t.result === "Win") sessionMap[t.session].wins++;
  });
  const bestSession = Object.entries(sessionMap).sort(([,a],[,b]) => (b.wins/b.total)-(a.wins/a.total))[0];

  // Sparkline data (last 10 trades P/L cumulative)
  const last10 = [...trades].sort((a,b) => new Date(a.trade_date)-new Date(b.trade_date)).slice(-10);
  let cum = 0;
  const plSparkline = last10.map(t => { cum += t.profit_loss || 0; return cum; });
  const rrSparkline = last10.map(t => t.risk_reward_ratio || 0);

  const SESSION_ICONS = { London: "☀️", "New York": "🌙", Asian: "☁️", Sydney: "🌅", Overlap: "🔄" };

  const kpis = [
    {
      label: "Win Rate",
      main: <div className="relative w-13"><Ring value={winRate} max={100} color="#22c55e" /><div className="absolute inset-0 flex items-center justify-center"><span className="text-[10px] font-bold">{winRate}%</span></div></div>,
      value: `${winRate}%`,
      sub: `${wins}W / ${losses}L`,
      spark: null, color: "text-emerald-500"
    },
    { label: "Average RR", value: `${avgRR}R`, sub: null, spark: rrSparkline, color: "text-primary" },
    { label: "Total P/L", value: totalPL >= 0 ? `+$${totalPL.toFixed(2)}` : `-$${Math.abs(totalPL).toFixed(2)}`, sub: null, spark: plSparkline, color: totalPL >= 0 ? "text-emerald-500" : "text-destructive" },
    { label: "Expectancy", value: `${expectancy > 0 ? "+" : ""}${expectancy}R`, sub: "per trade", spark: null, color: expectancy >= 0 ? "text-emerald-500" : "text-destructive" },
    { label: "Discipline Score", value: `${Math.round(discipline)}`, sub: discipline >= 80 ? "Excellent" : discipline >= 60 ? "Good" : "Needs Work", spark: null, color: discipline >= 70 ? "text-emerald-500" : "text-warning", suffix: "/100" },
    {
      label: bestSession ? `Best Session` : "Rule Violations",
      value: bestSession ? bestSession[0] : `${violations}`,
      sub: bestSession ? `${Math.round((bestSession[1].wins/bestSession[1].total)*100)}% Win Rate` : `↓ improving`,
      spark: null, color: bestSession ? "text-primary" : violations > 0 ? "text-destructive" : "text-emerald-500",
      icon: bestSession ? (SESSION_ICONS[bestSession[0]] || "📈") : null
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {kpis.map((k, i) => (
        <div key={i} className="bg-card border border-border/60 rounded-2xl p-3.5 flex flex-col gap-1.5">
          <p className="text-[10px] text-muted-foreground font-medium">{k.label}</p>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1">
                {k.icon && <span>{k.icon}</span>}
                <p className={cn("text-xl font-black font-mono leading-none", k.color)}>{k.value}</p>
                {k.suffix && <span className="text-xs text-muted-foreground">{k.suffix}</span>}
              </div>
              {k.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>}
            </div>
            {k.spark && k.spark.length > 1 && (
              <MiniSparkline data={k.spark} color={k.color.includes("emerald") ? "#22c55e" : k.color.includes("destructive") ? "#ef4444" : "#3b82f6"} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}