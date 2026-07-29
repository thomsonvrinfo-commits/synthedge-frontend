import React from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function EquityCurveCard({ trades = [], mode = "live" }) {
  const sorted = [...trades]
    .filter(t => t.trade_date && t.profit_loss != null)
    .sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date));

  let cumulative = 0;
  const data = sorted.map(t => {
    cumulative += t.profit_loss || 0;
    return {
      date: format(new Date(t.trade_date), "MMM d"),
      equity: parseFloat(cumulative.toFixed(2)),
    };
  });

  const totalPL = data.length > 0 ? data[data.length - 1].equity : 0;
  const isPositive = totalPL >= 0;

  if (!data.length) {
    return (
      <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5">
        <h3 className="text-sm font-semibold mb-2">Equity Curve</h3>
        <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">
          No trade data for this mode yet.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Equity Curve</h3>
        <span className={cn("text-sm font-bold", isPositive ? "text-emerald-500" : "text-destructive")}>
          {isPositive ? "+" : ""}${totalPL.toFixed(2)}
        </span>
      </div>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? "hsl(142 71% 45%)" : "hsl(0 72% 51%)"} stopOpacity={0.3} />
                <stop offset="95%" stopColor={isPositive ? "hsl(142 71% 45%)" : "hsl(0 72% 51%)"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={40} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke={isPositive ? "hsl(142 71% 45%)" : "hsl(0 72% 51%)"}
              fill="url(#equityFill)"
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}