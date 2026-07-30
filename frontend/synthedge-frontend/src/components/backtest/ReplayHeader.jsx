import React from "react";
import { RefreshCw, Loader2, Settings, Maximize2, Minimize2, Monitor } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BACKTEST_INDICES } from "@/lib/derivWebSocket";
import { cn } from "@/lib/utils";

const TIMEFRAMES = [
  { label: "1m",  value: 60 },
  { label: "5m",  value: 300 },
  { label: "15m", value: 900 },
  { label: "30m", value: 1800 },
  { label: "1h",  value: 3600 },
  { label: "4h",  value: 14400 },
  { label: "D",   value: 86400 },
];

export default function ReplayHeader({
  index, granularity, onIndexChange, onGranularityChange,
  playing, sessionId, loading, onRefresh,
  focusMode, onToggleFocus,
  onOpenSettings,
}) {
  const shortIndex = index
    .replace("Volatility ", "V")
    .replace(" (1s)", "s")
    .replace("Boom ", "B")
    .replace("Crash ", "C")
    .replace("Jump ", "J")
    .replace("Step Index", "Step");

  const tf = TIMEFRAMES.find(t => t.value === granularity)?.label || "1h";

  return (
    <div className="flex items-center gap-1.5 px-2 h-10 bg-card border-b border-border flex-shrink-0 overflow-x-auto scrollbar-none">
      {/* Index selector */}
      <Select value={index} onValueChange={onIndexChange}>
        <SelectTrigger className="h-7 w-auto min-w-[70px] max-w-[110px] text-xs font-bold border-border bg-secondary px-2 gap-1 flex-shrink-0">
          <SelectValue>{shortIndex}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-64 text-xs">
          {BACKTEST_INDICES.map(i => <SelectItem key={i} value={i} className="text-xs">{i}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* Timeframe pills — scrollable on tiny screens */}
      <div className="flex items-center gap-0.5 bg-secondary rounded-md p-0.5 flex-shrink-0 overflow-x-auto scrollbar-none">
        {TIMEFRAMES.map(t => (
          <button
            key={t.value}
            onClick={() => onGranularityChange(t.value)}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-semibold transition-all whitespace-nowrap min-w-[28px] min-h-[24px]",
              granularity === t.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Session ID — desktop only */}
      <span className="text-[11px] text-muted-foreground font-mono flex-shrink-0 hidden md:block">
        Replay #{sessionId}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Live/Paused indicator */}
      <div className={cn("flex items-center gap-1 text-[11px] font-semibold flex-shrink-0",
        playing ? "text-success" : "text-muted-foreground")}>
        <span className={cn("w-1.5 h-1.5 rounded-full",
          playing ? "bg-success animate-pulse" : "bg-muted-foreground")} />
        <span className="hidden sm:inline">{playing ? "Live" : "Paused"}</span>
      </div>

      {/* Refresh */}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center"
        title="Refresh data"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
      </button>

      {/* Fullscreen */}
      <button
        onClick={onToggleFocus}
        className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center"
        title={focusMode ? "Exit Focus [F]" : "Focus Mode [F]"}
      >
        {focusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
      </button>

      {/* Settings gear */}
      <button
        onClick={onOpenSettings}
        className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center"
        title="Chart Settings"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}