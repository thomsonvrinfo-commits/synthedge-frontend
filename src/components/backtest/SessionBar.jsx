import React from "react";
import { FlaskConical, CheckCircle2, ArrowLeft, Target, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SessionBar({ session, stats, tradeCount, onComplete, onExit }) {
  if (!session) return null;
  const isCompleted = session.status === "completed";

  const startedDate = session.started_at
    ? new Date(session.started_at).toLocaleDateString([], { month: "short", day: "numeric" })
    : "—";

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-card border-b border-border flex-shrink-0">
      <FlaskConical className="w-4 h-4 text-primary flex-shrink-0" />

      {/* Session identity */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">{session.name || "Untitled Session"}</p>
            <span className={cn(
              "text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0",
              isCompleted ? "bg-muted text-muted-foreground" : "bg-success/15 text-success"
            )}>
              {isCompleted ? "Completed" : "Active"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground truncate">
            {session.objective && (
              <span className="flex items-center gap-0.5 truncate">
                <Target className="w-2.5 h-2.5" /> {session.objective}
              </span>
            )}
            <span>Started {startedDate}</span>
          </div>
        </div>
      </div>

      {/* Compact live stats */}
      <div className="hidden sm:flex items-center gap-3 text-xs flex-shrink-0">
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground">Trades</p>
          <p className="font-bold text-sm">{tradeCount}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground">Win%</p>
          <p className="font-bold text-sm">{stats?.total > 0 ? `${stats.winRate}%` : "—"}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground">P/L</p>
          <p className={cn("font-bold text-sm flex items-center gap-0.5",
            stats?.totalPL > 0 ? "text-success" : stats?.totalPL < 0 ? "text-destructive" : ""
          )}>
            <TrendingUp className="w-3 h-3" />
            {stats?.total > 0 && stats.totalPL != null ? Number(stats.totalPL).toFixed(2) : "—"}
          </p>
        </div>
      </div>

      {/* Actions */}
      {!isCompleted && (
        <button
          onClick={onComplete}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-success/10 text-success border border-success/20 hover:bg-success/20 transition-colors flex-shrink-0"
        >
          <CheckCircle2 className="w-3 h-3" /> Complete
        </button>
      )}
      <button
        onClick={onExit}
        className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
      >
        <ArrowLeft className="w-3 h-3" /> Hub
      </button>
    </div>
  );
}