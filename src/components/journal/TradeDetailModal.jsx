import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { Pencil, ArrowUpRight, ArrowDownRight, Star, AlertTriangle, BookOpen, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { RESULT_COLORS, EMOTION_COLORS } from "@/lib/traderUtils";

function InfoRow({ label, value, className }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <span className={cn("text-xs font-medium text-right", className)}>{value}</span>
    </div>
  );
}

function RatingBar({ value, max = 10, color = "bg-primary" }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-xs font-mono font-semibold w-6">{value}</span>
    </div>
  );
}

export default function TradeDetailModal({ trade, open, onClose, onEdit }) {
  if (!trade) return null;

  const rc = RESULT_COLORS[trade.result] || RESULT_COLORS.Win;
  const isBuy = trade.direction === "Buy";
  const pl = trade.profit_loss;

  const screenshots = [
    { key: "screenshot_before", label: "Before", url: trade.screenshot_before },
    { key: "screenshot_during", label: "During", url: trade.screenshot_during },
    { key: "screenshot_after", label: "After", url: trade.screenshot_after },
  ].filter(s => s.url);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto bg-card border-border p-0">
        {/* Header */}
        <div className="p-5 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", isBuy ? "bg-success/15" : "bg-destructive/15")}>
                {isBuy ? <ArrowUpRight className="w-5 h-5 text-success" /> : <ArrowDownRight className="w-5 h-5 text-destructive" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-base">{trade.synthetic_index}</h2>
                  <Badge className={cn("text-xs", rc.bg, rc.text, rc.border, "border")}>{trade.result}</Badge>
                  {trade.strategy && <Badge variant="outline" className="text-xs">{trade.strategy}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {trade.trade_date ? format(new Date(trade.trade_date), "EEEE, MMM d yyyy · HH:mm") : "—"}
                  {trade.session && ` · ${trade.session}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cn("text-xl font-bold font-mono", pl >= 0 ? "text-success" : "text-destructive")}>
                {pl != null ? (pl >= 0 ? "+" : "") + pl.toFixed(2) : "—"}
              </span>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(trade)}>
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="info" className="p-5">
          <TabsList className="bg-secondary mb-4">
            <TabsTrigger value="info">Trade Info</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
            {screenshots.length > 0 && <TabsTrigger value="screenshots">Screenshots</TabsTrigger>}
            {trade.rule_violations?.length > 0 && (
              <TabsTrigger value="violations" className="text-destructive">Violations</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="info" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary/50 rounded-xl p-4 space-y-0">
                <InfoRow label="Entry Price" value={trade.entry_price} className="font-mono" />
                <InfoRow label="Exit Price" value={trade.exit_price} className="font-mono" />
                <InfoRow label="Stop Loss" value={trade.stop_loss} className="font-mono text-destructive" />
                <InfoRow label="Take Profit" value={trade.take_profit} className="font-mono text-success" />
                <InfoRow label="Lot Size" value={trade.lot_size} className="font-mono" />
                <InfoRow label="R:R Ratio" value={trade.risk_reward_ratio} className="font-mono text-primary" />
              </div>
              <div className="bg-secondary/50 rounded-xl p-4 space-y-0">
                <InfoRow label="Direction" value={trade.direction} className={isBuy ? "text-success" : "text-destructive"} />
                <InfoRow label="Session" value={trade.session} />
                <InfoRow label="Result" value={trade.result} className={rc.text} />
                <InfoRow
                  label="Emotional State"
                  value={trade.emotional_state}
                  className={EMOTION_COLORS[trade.emotional_state]}
                />
                <InfoRow label="Confidence" value={trade.confidence_level ? `${trade.confidence_level}/10` : null} />
                <InfoRow label="Source" value={trade.source === "backtest" ? "Backtest" : "Journal"} />
              </div>
            </div>
            {trade.trade_reasoning && (
              <div className="bg-secondary/50 rounded-xl p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" /> Trade Reasoning
                </p>
                <p className="text-sm leading-relaxed">{trade.trade_reasoning}</p>
              </div>
            )}
            {trade.market_conditions && (
              <div className="bg-secondary/50 rounded-xl p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Market Conditions</p>
                <p className="text-sm leading-relaxed">{trade.market_conditions}</p>
              </div>
            )}
            {trade.notes && (
              <div className="bg-secondary/50 rounded-xl p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Notes</p>
                <p className="text-sm leading-relaxed">{trade.notes}</p>
              </div>
            )}
            {trade.custom_fields && Object.keys(trade.custom_fields).length > 0 && (
              <div className="bg-secondary/50 rounded-xl p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3">Custom Fields</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(trade.custom_fields).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0 col-span-1">
                      <span className="text-xs text-muted-foreground">{key}</span>
                      <span className="text-xs font-medium">{typeof val === "boolean" ? (val ? "✓" : "✗") : String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="review" className="space-y-4">
            {trade.execution_rating && (
              <div className="bg-secondary/50 rounded-xl p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5" /> Execution Rating
                </p>
                <RatingBar value={trade.execution_rating} color={trade.execution_rating >= 7 ? "bg-success" : trade.execution_rating >= 5 ? "bg-warning" : "bg-destructive"} />
              </div>
            )}
            {trade.mistakes_made && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
                <p className="text-xs font-semibold text-destructive mb-2">Mistakes Made</p>
                <p className="text-sm leading-relaxed">{trade.mistakes_made}</p>
              </div>
            )}
            {trade.lessons_learned && (
              <div className="bg-success/10 border border-success/20 rounded-xl p-4">
                <p className="text-xs font-semibold text-success mb-2">Lessons Learned</p>
                <p className="text-sm leading-relaxed">{trade.lessons_learned}</p>
              </div>
            )}
            {!trade.execution_rating && !trade.mistakes_made && !trade.lessons_learned && (
              <div className="text-center py-10 text-sm text-muted-foreground">
                No review data. Edit this trade to add a post-trade review.
              </div>
            )}
          </TabsContent>

          {screenshots.length > 0 && (
            <TabsContent value="screenshots" className="space-y-3">
              {screenshots.map(s => (
                <div key={s.key}>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" /> {s.label} Trade
                  </p>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    <img src={s.url} alt={s.label} className="w-full rounded-xl border border-border hover:opacity-90 transition-opacity" />
                  </a>
                </div>
              ))}
            </TabsContent>
          )}

          {trade.rule_violations?.length > 0 && (
            <TabsContent value="violations">
              <div className="space-y-2">
                {trade.rule_violations.map((v, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                    <span className="text-sm">{v}</span>
                  </div>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}