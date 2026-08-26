import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Target, ChevronUp, ChevronDown, Loader2, Save, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { priceDecimals } from "@/lib/chartEngine";

export default function TradeDrawer({
  direction, setDirection, entryPrice, setEntryPrice,
  sl, setSl, tp, setTp, currentPrice, activeTrade,
  onPlaceTrade, trades, isPro, onSaveSession, savingSession,
  replayStats = null,
  volume, setVolume, minVolume, volumeStep,
}) {
  const [open, setOpen] = useState(false);

  const dec = priceDecimals(currentPrice);
  // Use replayStats if available, else fall back to legacy trades array
  const winCount = replayStats?.wins ?? trades.filter(t => t.result === "Win").length;
  const totalPL = replayStats?.totalPL ?? trades.reduce((s, t) => s + (t.profit_loss || 0), 0);
  const totalTrades = replayStats?.total ?? trades.length;
  const pendingTrades = replayStats?.pending ?? 0;

  const rrDisplay = (() => {
    if (!sl || !tp) return null;
    const ep = parseFloat(entryPrice) || currentPrice;
    if (!ep) return null;
    const risk = Math.abs(ep - parseFloat(sl));
    const rew  = Math.abs(parseFloat(tp) - ep);
    return risk > 0 ? (rew / risk).toFixed(2) : null;
  })();

  return (
    <>
      {/* Collapsed tab — always visible */}
      <button
        onClick={() => setOpen(p => !p)}
        className={cn(
          "absolute right-2 top-2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-lg transition-all",
          "bg-card/90 backdrop-blur-sm border border-border hover:bg-card"
        )}
      >
        <Target className="w-3.5 h-3.5 text-primary" />
        <span>Trade</span>
        {trades.length > 0 && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">{trades.length}</Badge>
        )}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* Expanded panel — slides in from right */}
      {open && (
        <div className="absolute right-2 top-10 z-20 w-64 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-2xl p-3 space-y-3">
          {/* Active trade indicator */}
          {activeTrade && (
            <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg text-xs text-center text-primary font-medium animate-pulse">
              Watching for SL/TP…
            </div>
          )}

          {/* Direction */}
          <div className="flex gap-1.5">
            {["Buy", "Sell"].map(d => (
              <Button key={d} size="sm"
                variant={direction === d ? "default" : "outline"}
                className={cn("flex-1 text-xs h-8",
                  direction === d && d === "Buy" && "bg-success hover:bg-success/90 border-success text-white",
                  direction === d && d === "Sell" && "bg-destructive hover:bg-destructive/90 border-destructive text-white"
                )}
                onClick={() => setDirection(d)} disabled={!!activeTrade}>
                {d === "Buy" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {d}
              </Button>
            ))}
          </div>

          {/* Inputs */}
          <div className="space-y-1.5">
            <div>
              <Label className="text-[10px] text-muted-foreground">Entry</Label>
              <Input type="number" step="any" value={entryPrice} onChange={e => setEntryPrice(e.target.value)}
                placeholder={currentPrice?.toFixed(dec) || "—"}
                className="bg-secondary border-border font-mono text-xs mt-0.5 h-7" disabled={!!activeTrade} />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Stop Loss</Label>
              <Input type="number" step="any" value={sl} onChange={e => setSl(e.target.value)}
                className="bg-secondary border-border font-mono text-xs mt-0.5 h-7" disabled={!!activeTrade} />
            </div>
                      <div>
              <Label className="text-[10px] text-muted-foreground">Take Profit</Label>
              <Input type="number" step="any" value={tp} onChange={e => setTp(e.target.value)}
                className="bg-secondary border-border font-mono text-xs mt-0.5 h-7" disabled={!!activeTrade} />
            </div>

            <div>
              <Label className="text-[10px] text-muted-foreground">
                Stake / Lot Size
              </Label>
              <Input
                type="number"
                min={minVolume}
                step={volumeStep}
                value={volume}
                onChange={e => setVolume(e.target.value)}
                placeholder={String(minVolume ?? "")}
                className="bg-secondary border-border font-mono text-xs mt-0.5 h-7"
                disabled={!!activeTrade}
              />
              <p className="text-[9px] text-muted-foreground mt-0.5">
                Min: {minVolume ?? "—"}
              </p>
            </div>
          </div>

          {/* RR display */}
          {rrDisplay && !activeTrade && (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground bg-secondary rounded-lg px-2 py-1.5">
              <span>Risk/Reward</span>
              <span className="font-semibold font-mono text-primary">{rrDisplay}R</span>
            </div>
          )}

          <Button className="w-full h-8 text-xs" onClick={onPlaceTrade} disabled={!!activeTrade || !currentPrice}>
            {activeTrade ? "Trade Active…" : "Place Trade"}
          </Button>

          <p className="text-[9px] text-muted-foreground/50 text-center">[G] Long · [R] Short on chart</p>

          {/* Session stats */}
          {(totalTrades > 0 || pendingTrades > 0) && (
            <>
              <div className="h-px bg-border" />
              {pendingTrades > 0 && (
                <div className="flex items-center justify-between text-[10px] px-2 py-1 rounded-lg bg-primary/10 border border-primary/20">
                  <span className="text-primary font-medium">Active Trades</span>
                  <span className="font-bold text-primary font-mono">{pendingTrades}</span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <p className="text-sm font-bold font-mono">{totalTrades}</p>
                  <p className="text-[10px] text-muted-foreground">Closed</p>
                </div>
                <div>
                  <p className="text-sm font-bold font-mono">
                    {totalTrades > 0 ? ((winCount / totalTrades) * 100).toFixed(0) : "—"}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">Win Rate</p>
                </div>
                <div>
                  <p className={cn("text-sm font-bold font-mono", totalPL >= 0 ? "text-success" : "text-destructive")}>
                    {totalPL >= 0 ? "+" : ""}{typeof totalPL === "number" ? totalPL.toFixed(2) : "0.00"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">P/L</p>
                </div>
              </div>

              <div className="flex gap-1.5">
                {isPro ? (
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px] gap-1"
                    onClick={onSaveSession} disabled={savingSession}>
                    {savingSession ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                  </Button>
                ) : (
                  <Link to="/upgrade" className="flex-1">
                    <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1 text-warning border-warning/30">
                      <Crown className="w-3 h-3" /> Save (Pro)
                    </Button>
                  </Link>
                )}
                <Link to="/journal">
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]">Journal</Button>
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
