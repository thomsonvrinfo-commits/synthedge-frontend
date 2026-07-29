import React from "react";
import { useQuery } from "@tanstack/react-query";
import { listConnections, listBrokerTrades } from "@/api/broker";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { TrendingUp, Target, Wallet, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export default function BrokerStatCards() {
  const { user } = useCurrentUser();

  const { data: connections = [] } = useQuery({
    queryKey: ["brokerConnections", user?.id],
    queryFn: () => listConnections(),
    enabled: !!user?.id,
    initialData: [],
  });
  const { data: trades = [] } = useQuery({
    queryKey: ["brokerTrades", user?.id],
    queryFn: () => listBrokerTrades({ limit: 500 }),
    enabled: !!user?.id,
    initialData: [],
  });

  if (!connections.length) return null;

  if (!trades.length) {
    return (
      <div className="bg-card border border-border/60 rounded-2xl p-5 text-center">
        <p className="text-sm text-muted-foreground">
          Your connected account{connections.length !== 1 ? "s" : ""} {connections.length === 1 ? "is" : "are"} linked — your next trade will appear here automatically.
        </p>
      </div>
    );
  }

  const wins = trades.filter(t => t.result === "win").length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;
  const totalPnl = trades.reduce((s, t) => s + Number(t.pnl || 0), 0);
  const rMultiples = trades.map(t => t.r_multiple).filter(v => v != null && !isNaN(v));
  const avgR = rMultiples.length ? (rMultiples.reduce((s, v) => s + v, 0) / rMultiples.length).toFixed(2) : "—";

  const sorted = [...trades].sort((a, b) =>
    new Date(b.closed_at || b.opened_at || 0) - new Date(a.closed_at || a.opened_at || 0)
  );
  let streak = 0, streakType = null;
  for (const t of sorted) {
    if (t.result === "breakeven") continue;
    if (streakType === null) { streakType = t.result; streak = 1; }
    else if (t.result === streakType) streak++;
    else break;
  }

  const cards = [
    { label: "Win Rate", value: winRate + "%", icon: Target, tone: "text-success" },
    { label: "Avg R Multiple", value: avgR, icon: TrendingUp, tone: "text-primary" },
    { label: "Total P/L", value: (totalPnl >= 0 ? "+" : "") + totalPnl.toFixed(2), icon: Wallet, tone: totalPnl >= 0 ? "text-success" : "text-destructive" },
    { label: "Current Streak", value: streak ? `${streak} ${streakType === "win" ? "W" : "L"}` : "—", icon: Flame, tone: streakType === "win" ? "text-success" : streakType === "loss" ? "text-destructive" : "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-card border border-border/60 rounded-2xl p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{c.label}</span>
            <c.icon className={cn("w-4 h-4", c.tone)} />
          </div>
          <span className={cn("text-xl font-bold", c.tone)}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}