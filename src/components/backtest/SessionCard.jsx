import React from "react";
import { cn } from "@/lib/utils";
import { CheckSquare, Square } from "lucide-react";

function Stat({ label, value, className }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-bold", className)}>{value}</p>
    </div>
  );
}

export default function SessionCard({
  session,
  tradeCount = 0,
  stats,
  onClick,
  selectionMode = false,
  isSelected = false,
  onSelect,
}) {
  const isActive = session.status !== "completed";

  const startedDate = session.started_at
    ? new Date(session.started_at).toLocaleDateString([], { month: "short", day: "numeric" })
    : session.created_date
    ? new Date(session.created_date).toLocaleDateString([], { month: "short", day: "numeric" })
    : "—";

  return (
    <div
      onClick={selectionMode ? onSelect : onClick}
      className={cn(
        "text-left bg-card border rounded-xl p-4 transition-colors group cursor-pointer relative",
        isSelected ? "border-primary" : "border-border/60 hover:border-primary/40"
      )}
    >
      {selectionMode && (
        <div className="absolute top-3 right-3 z-10" onClick={(e) => { e.stopPropagation(); onSelect?.(); }}>
          {isSelected
            ? <CheckSquare className="w-4 h-4 text-primary" />
            : <Square className="w-4 h-4 text-muted-foreground" />}
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-sm truncate flex-1 pr-6">{session.name || "Untitled Session"}</h3>
        <span className={cn(
          "text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0",
          isActive ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
        )}>
          {isActive ? "Active" : "Completed"}
        </span>
      </div>
      {session.objective && (
        <p className="text-xs text-muted-foreground mb-1 line-clamp-2">{session.objective}</p>
      )}
      {session.strategy_name && (
        <p className="text-[10px] text-primary/70 font-medium mb-1">⚙ {session.strategy_name}</p>
      )}
      <p className="text-[10px] text-muted-foreground/60 mb-3">Started {startedDate}</p>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Trades" value={tradeCount} />
        <Stat label="Win%" value={stats.total > 0 ? `${stats.winRate}%` : "—"} />
        <Stat label="Avg RR" value={stats.total > 0 ? stats.avgRR : "—"} />
        <Stat
          label="P/L"
          value={stats.total > 0 ? stats.totalPL.toFixed(2) : "—"}
          className={stats.totalPL > 0 ? "text-success" : stats.totalPL < 0 ? "text-destructive" : ""}
        />
      </div>
    </div>
  );
}