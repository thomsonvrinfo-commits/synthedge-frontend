import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ArrowUpRight, ArrowDownRight, Eye, AlertTriangle, Star } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { RESULT_COLORS, EMOTION_COLORS } from "@/lib/traderUtils";

export default function TradeCard({ trade, onEdit, onDelete, onView }) {
  const isBuy = trade.direction === "Buy";
  const rc = RESULT_COLORS[trade.result] || RESULT_COLORS.Win;

  return (
    <div
      className="bg-card border border-border rounded-xl p-4 hover:border-primary/20 transition-all duration-200 group cursor-pointer"
      onClick={() => onView(trade)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", isBuy ? "bg-success/15" : "bg-destructive/15")}>
            {isBuy ? <ArrowUpRight className="w-4 h-4 text-success" /> : <ArrowDownRight className="w-4 h-4 text-destructive" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{trade.synthetic_index}</span>
              <Badge className={cn("text-[10px] px-1.5 py-0", rc.bg, rc.text, rc.border, "border")}>{trade.result}</Badge>
              {trade.strategy && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{trade.strategy}</Badge>}
              {trade.rule_violations?.length > 0 && (
                <Badge className="text-[10px] px-1.5 py-0 bg-destructive/15 text-destructive border border-destructive/30">
                  <AlertTriangle className="w-2.5 h-2.5 mr-1" />{trade.rule_violations.length} violation{trade.rule_violations.length > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground font-mono flex-wrap">
              {trade.entry_price && <span>E: {trade.entry_price}</span>}
              {trade.exit_price && <span>X: {trade.exit_price}</span>}
              {trade.risk_reward_ratio && <span className="text-primary">RR: {trade.risk_reward_ratio}</span>}
              {trade.lot_size && <span>Lot: {trade.lot_size}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
              {trade.trade_date && <span>{format(new Date(trade.trade_date), "MMM d · HH:mm")}</span>}
              {trade.session && <span className="text-muted-foreground/70">· {trade.session}</span>}
              {trade.emotional_state && (
                <span className={cn(EMOTION_COLORS[trade.emotional_state])}>· {trade.emotional_state}</span>
              )}
              {trade.execution_rating && (
                <span className="flex items-center gap-0.5">
                  · <Star className="w-2.5 h-2.5" /> {trade.execution_rating}/10
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className={cn("text-sm font-bold font-mono flex-shrink-0",
            trade.profit_loss > 0 ? "text-success" : trade.profit_loss < 0 ? "text-destructive" : "text-muted-foreground"
          )}>
            {trade.profit_loss != null ? (trade.profit_loss >= 0 ? "+" : "") + trade.profit_loss.toFixed(2) : "—"}
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onView(trade)}>
              <Eye className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(trade)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(trade)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}