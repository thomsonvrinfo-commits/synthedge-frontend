import React, { useState } from "react";
import { MoreHorizontal, Edit2, Trash2, Eye, CheckCircle2, XCircle, Clock, TrendingUp, Image, Square, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const SESSION_ICONS = { London: "☀️", "New York": "🌙", Asian: "☁️", Sydney: "🌅", Overlap: "🔄" };
const EMOTION_ICONS = { Calm: "😌", Confident: "😊", Anxious: "😟", FOMO: "😰", Revenge: "😡", Frustrated: "😤", Excited: "🤩", Neutral: "😐", Fearful: "😨", Overconfident: "😏", Focused: "🎯" };

function symbolShort(s) {
  if (!s) return "?";
  if (s.includes("Volatility 75")) return "V75";
  if (s.includes("Volatility 100")) return "V100";
  if (s.includes("Volatility 50")) return "V50";
  if (s.includes("Volatility 25")) return "V25";
  if (s.includes("Volatility 10")) return "V10";
  if (s.includes("Boom 1000")) return "B1K";
  if (s.includes("Boom 500")) return "B500";
  if (s.includes("Crash 1000")) return "C1K";
  if (s.includes("Crash 500")) return "C500";
  if (s.includes("Range Break 100")) return "R_100";
  if (s.includes("Range Break 200")) return "R_200";
  if (s.includes("Step")) return "STEP";
  if (s.includes("EUR")) return "EUR";
  if (s.includes("GBP")) return "GBP";
  if (s.includes("XAU")) return "GOLD";
  return s.slice(0, 4).toUpperCase();
}

export default function TradeRowCard({ trade, onEdit, onDelete, onView, selected, onSelect }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isWin = trade.result === "Win";
  const isLoss = trade.result === "Loss";
  const isBE = trade.result === "Breakeven";
  const pl = trade.pl ?? trade.profit_loss;
  const rr = trade.rr ?? trade.risk_reward_ratio;
  const planFollowed = !trade.rule_violations?.length;
  const emotion = trade.emotional_state;
  const isLive = trade.source !== "backtest";

  return (
    <div
      className={cn(
        "bg-card border rounded-2xl p-4 flex flex-col gap-3 hover:border-border cursor-pointer transition-all group",
        isWin ? "border-emerald-500/25" : isLoss ? "border-destructive/25" : "border-border/60",
        selected && "ring-2 ring-primary ring-offset-1 border-primary/40"
      )}
      onClick={() => { if (onSelect) { onSelect(); } else { onView(trade); } }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Result badge */}
          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-md",
            isWin ? "bg-emerald-500/15 text-emerald-500" : isLoss ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"
          )}>
            {trade.result?.toUpperCase() || "—"}
          </span>
          {/* P/L */}
          <span className={cn("text-sm font-black font-mono", isWin ? "text-emerald-500" : isLoss ? "text-destructive" : "text-muted-foreground")}>
            {pl != null ? `${pl >= 0 ? "+" : ""}$${Math.abs(pl).toFixed(2)}` : "—"}
          </span>
          {/* RR */}
          {rr != null && (
            <span className={cn("text-xs font-semibold font-mono", isWin ? "text-emerald-500/80" : isLoss ? "text-destructive/80" : "text-muted-foreground")}>
              {rr >= 0 ? "+" : ""}{rr}R
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Select checkbox */}
          {onSelect && (
            <button onClick={e => { e.stopPropagation(); onSelect(); }} className="opacity-0 group-hover:opacity-100 transition-opacity">
              {selected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
            </button>
          )}
          {/* Time */}
          <span className="text-[10px] text-muted-foreground font-mono">
            {trade.trade_date ? format(new Date(trade.trade_date), "hh:mm a") : ""}
          </span>

          {/* Menu */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors opacity-0 group-hover:opacity-100">
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 bg-card border border-border rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden">
                {[
                  { icon: Eye, label: "View Trade", action: () => { onView(trade); setMenuOpen(false); } },
                  { icon: Edit2, label: "Edit Trade", action: () => { onEdit(trade); setMenuOpen(false); } },
                  { icon: Trash2, label: "Delete Trade", action: () => { onDelete(trade); setMenuOpen(false); }, danger: true },
                ].map(item => (
                  <button key={item.label} onClick={item.action}
                    className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-secondary transition-colors text-left",
                      item.danger ? "text-destructive hover:bg-destructive/10" : "text-foreground")}>
                    <item.icon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Middle: symbol + direction + setup + price levels */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Symbol */}
        <span className="text-sm font-bold px-2 py-0.5 rounded-lg bg-secondary/60 border border-border/60">
          {symbolShort(trade.symbol || trade.synthetic_index)}
        </span>
        {/* Direction */}
        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md",
          trade.direction === "Buy" ? "bg-emerald-500/15 text-emerald-500" : "bg-destructive/15 text-destructive"
        )}>
          {trade.direction?.toUpperCase()}
        </span>
        {/* Setup */}
        {(trade.setup || trade.strategy) && (
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold border border-primary/20">
            {trade.setup || trade.strategy}
          </span>
        )}
        {/* Session */}
        {trade.session && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {SESSION_ICONS[trade.session] || "📍"} {trade.session}
          </span>
        )}
        {/* Date */}
        {trade.trade_date && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {format(new Date(trade.trade_date), "MMM d, yyyy")}
          </span>
        )}
      </div>

      {/* Price levels */}
      {(trade.entry_price || trade.stop_loss || trade.take_profit) && (
        <div className="flex items-center gap-3 text-[10px]">
          {trade.entry_price && <span className="text-muted-foreground">Entry <span className="font-mono text-foreground">{trade.entry_price}</span></span>}
          {trade.stop_loss && <span className="text-muted-foreground">SL <span className="font-mono text-destructive">{trade.stop_loss}</span></span>}
          {trade.take_profit && <span className="text-muted-foreground">TP <span className="font-mono text-emerald-500">{trade.take_profit}</span></span>}
        </div>
      )}

      {/* Bottom: psychology + plan adherence */}
      <div className="flex items-center gap-3 pt-1 border-t border-border/40">
        {emotion && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {EMOTION_ICONS[emotion] || "😐"} {emotion}
          </span>
        )}
        <span className={cn("flex items-center gap-1 text-[11px]", planFollowed ? "text-emerald-500" : "text-destructive")}>
          {planFollowed
            ? <><CheckCircle2 className="w-3.5 h-3.5" /> Plan Followed</>
            : <><XCircle className="w-3.5 h-3.5" /> Plan Not Followed</>
          }
        </span>
        {trade.risk_reward_ratio && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
            <TrendingUp className="w-3 h-3" /> {trade.risk_reward_ratio}R
          </span>
        )}
        {trade.screenshot_before && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Image className="w-3 h-3" /> 1
          </span>
        )}
      </div>
    </div>
  );
}