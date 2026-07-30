import React from "react";
import { FlaskConical } from "lucide-react";
import SessionCard from "@/components/backtest/SessionCard";
import { computeStats } from "@/lib/traderUtils";

export default function ResearchSessions({ sessions, trades, onSelectSession }) {
  if (!sessions.length) {
    return (
      <div className="flex flex-col items-center justify-center h-52 text-center bg-card border border-border/60 rounded-2xl">
        <FlaskConical className="w-10 h-10 text-muted-foreground/20 mb-3" />
        <h3 className="font-semibold">No research sessions yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Create a research session from the Replay hub to start structured backtesting with trackable results.
        </p>
      </div>
    );
  }

  const sessionsWithStats = sessions.map(session => {
    const sessionTrades = trades.filter(t => t.replay_session_id === session.id);
    return { ...session, tradeCount: sessionTrades.length, stats: computeStats(sessionTrades) };
  });

  // Sort: active first, then completed
  const sorted = [...sessionsWithStats].sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (a.status !== "completed" && b.status === "completed") return -1;
    return new Date(b.started_at || b.created_date) - new Date(a.started_at || a.created_date);
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
      {sorted.map(session => (
        <SessionCard
          key={session.id}
          session={session}
          tradeCount={session.tradeCount}
          stats={session.stats}
          onClick={() => onSelectSession(session.id)}
        />
      ))}
    </div>
  );
}