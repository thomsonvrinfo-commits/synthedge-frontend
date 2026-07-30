import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  SkipBack, SkipForward, Play, Pause, ChevronLeft, ChevronRight, ChevronUp, ChevronDown
} from "lucide-react";
import { priceDecimals } from "@/lib/chartEngine";

const SPEED_LABELS = { 800: "0.5x", 400: "1x", 200: "2x", 100: "4x", 50: "8x" };
const SPEEDS = [800, 400, 200, 100, 50];

export default function ReplayBottomBar({
  playing, onTogglePlay,
  visibleCount, totalCount,
  onStepBack, onStepForward,
  onSkipBack10, onSkipForward10,
  speed, onSpeedChange,
  currentPrice,
  trades = [],
  disciplineScore = null,
  replayStats = null,
}) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const progress = totalCount > 0 ? (visibleCount / totalCount) * 100 : 0;
  const dec = priceDecimals(currentPrice);
  const currentSpeedLabel = SPEED_LABELS[speed] || "1x";

  // Use replayStats if provided, fallback to legacy trades array
  const stats = replayStats || {
    total:   trades.filter(t => t.result === "Win" || t.result === "Loss").length,
    pending: 0,
    wins:    trades.filter(t => t.result === "Win").length,
    losses:  trades.filter(t => t.result === "Loss").length,
    winRate: trades.length > 0 ? ((trades.filter(t => t.result === "Win").length / trades.length) * 100).toFixed(1) : null,
    totalPL: trades.reduce((s, t) => s + (t.profit_loss || 0), 0),
    avgRR:   0,
  };
  const { total, pending, wins, losses, winRate, totalPL, avgRR } = stats;

  return (
    <div className="flex-shrink-0 bg-card border-t border-border select-none">
      {/* Progress bar — full width, no padding */}
      <div
        className="h-1 bg-secondary cursor-pointer relative group"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          // pass up via prop if needed — no-op for now
        }}
      >
        <div
          className="h-full bg-primary transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Main controls row */}
      <div className="flex items-center justify-between px-2 py-1.5 gap-1">
        {/* Left: counter + speed */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] font-mono text-muted-foreground hidden sm:block">
            {visibleCount}/{totalCount}
          </span>
          {/* Speed */}
          <div className="relative">
            <button
              onClick={() => setSpeedOpen(p => !p)}
              className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-secondary text-xs font-semibold text-foreground hover:bg-accent transition-all"
            >
              {currentSpeedLabel}
              {speedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {speedOpen && (
              <div className="absolute bottom-full mb-1 left-0 bg-card border border-border rounded-xl shadow-xl py-1 z-30 min-w-[64px]">
                {SPEEDS.map(s => (
                  <button
                    key={s}
                    onClick={() => { onSpeedChange(s); setSpeedOpen(false); }}
                    className={cn(
                      "w-full text-xs px-3 py-1.5 text-left hover:bg-secondary transition-colors",
                      speed === s ? "text-primary font-semibold" : "text-muted-foreground"
                    )}
                  >
                    {SPEED_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: transport controls */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* -10 */}
          <button onClick={onSkipBack10} className="flex flex-col items-center justify-center w-10 h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <SkipBack className="w-4 h-4" />
            <span className="text-[7px] leading-none mt-0.5">-10</span>
          </button>

          {/* Step back */}
          <button onClick={onStepBack} className="flex flex-col items-center justify-center w-10 h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <ChevronLeft className="w-4 h-4" />
            <span className="text-[7px] leading-none mt-0.5">Step</span>
          </button>

          {/* Play/Pause — bigger on mobile */}
          <button
            onClick={onTogglePlay}
            className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-all active:scale-95 mx-1"
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>

          {/* Step forward */}
          <button onClick={onStepForward} className="flex flex-col items-center justify-center w-10 h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <ChevronRight className="w-4 h-4" />
            <span className="text-[7px] leading-none mt-0.5">Step</span>
          </button>

          {/* +10 */}
          <button onClick={onSkipForward10} className="flex flex-col items-center justify-center w-10 h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
            <SkipForward className="w-4 h-4" />
            <span className="text-[7px] leading-none mt-0.5">+10</span>
          </button>
        </div>

        {/* Right: session stats */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {(total > 0 || pending > 0) && (
            <>
              {pending > 0 && (
                <div className="text-right">
                  <p className="text-[9px] text-muted-foreground leading-none">Active</p>
                  <p className="text-xs font-bold font-mono leading-tight text-primary">{pending}</p>
                </div>
              )}
              {total > 0 && (
                <>
                  <div className="text-right hidden sm:block">
                    <p className="text-[9px] text-muted-foreground leading-none">W/L</p>
                    <p className="text-xs font-bold font-mono leading-tight">
                      <span className="text-success">{wins}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-destructive">{losses}</span>
                    </p>
                  </div>
                  {winRate !== null && (
                    <div className="text-right">
                      <p className="text-[9px] text-muted-foreground leading-none">WR</p>
                      <p className="text-xs font-bold font-mono leading-tight">{winRate}%</p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-[9px] text-muted-foreground leading-none">P/L</p>
                    <p className={cn("text-xs font-bold font-mono leading-tight", totalPL >= 0 ? "text-success" : "text-destructive")}>
                      {totalPL >= 0 ? "+" : ""}{typeof totalPL === "number" ? totalPL.toFixed(2) : "0.00"}
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}