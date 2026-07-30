import React from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, SkipForward, SkipBack, RotateCcw, FastForward } from "lucide-react";
import { priceDecimals } from "@/lib/chartEngine";

export default function ReplayControls({
  playing, onTogglePlay,
  visibleCount, totalCount,
  onStepForward, onStepBack,
  onRewind,
  speed, onSpeedChange,
  currentPrice,
  disabled = false,
}) {
  const dec = currentPrice != null ? priceDecimals(currentPrice) : 2;
  const progress = totalCount > 0 ? ((visibleCount / totalCount) * 100).toFixed(1) : 0;

  const speedLabel = speed <= 100 ? "Fastest" : speed <= 250 ? "Fast" : speed <= 500 ? "Normal" : speed <= 750 ? "Slow" : "Slowest";

  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-2.5">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-secondary rounded-full h-1">
          <div
            className="bg-primary h-1 rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
          {visibleCount} / {totalCount}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Rewind 20 */}
        <Button variant="outline" size="icon" onClick={onRewind}
          disabled={disabled || visibleCount <= 10} title="Rewind 20 candles [←]"
          className="h-8 w-8">
          <SkipBack className="w-3.5 h-3.5" />
        </Button>

        {/* Step back 1 */}
        <Button variant="outline" size="icon" onClick={onStepBack}
          disabled={disabled || playing || visibleCount <= 1} title="Back 1 candle"
          className="h-8 w-8">
          <RotateCcw className="w-3 h-3" />
        </Button>

        {/* Play/Pause */}
        <Button variant="default" size="icon" onClick={onTogglePlay}
          disabled={disabled || visibleCount >= totalCount}
          className="h-8 w-8">
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </Button>

        {/* Step forward */}
        <Button variant="outline" size="icon" onClick={onStepForward}
          disabled={disabled || playing || visibleCount >= totalCount} title="Forward 1 candle [→]"
          className="h-8 w-8">
          <SkipForward className="w-3.5 h-3.5" />
        </Button>

        {/* +10 */}
        <Button variant="outline" size="sm" className="text-xs h-8 px-2.5"
          onClick={() => { for (let i = 0; i < 10; i++) onStepForward(); }}
          disabled={disabled || playing || visibleCount >= totalCount}>
          <FastForward className="w-3 h-3 mr-1" />+10
        </Button>

        {/* Speed */}
        <div className="flex items-center gap-2 flex-1 min-w-[140px]">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap w-12">{speedLabel}</span>
          <Slider
            value={[1000 - speed]}
            max={950} min={0} step={50}
            onValueChange={([v]) => onSpeedChange(1000 - v)}
            className="flex-1"
          />
        </div>

        {/* Price badge */}
        {currentPrice != null && (
          <Badge variant="outline" className="font-mono text-xs">
            {currentPrice.toFixed(dec)}
          </Badge>
        )}
      </div>
    </div>
  );
}