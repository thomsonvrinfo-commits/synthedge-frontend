import React from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format } from "date-fns";

export default function EquityCurve({ trades }) {
  if (!trades || trades.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold mb-4">Equity Curve</h3>
        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
          No trade data yet
        </div>
      </div>
    );
  }

  const sorted = [...trades]
    .filter(t => t.trade_date && t.profit_loss != null)
    .sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date));

  let cumulative = 0;
  const data = sorted.map(t => {
    cumulative += t.profit_loss || 0;
    return {
      date: format(new Date(t.trade_date), "MMM d"),
      equity: parseFloat(cumulative.toFixed(2)),
      pl: t.profit_loss,
    };
  });

  const isPositive = data.length > 0 && data[data.length - 1].equity >= 0;

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h3 className="text-sm font-semibold mb-4">Equity Curve</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? "hsl(142 71% 45%)" : "hsl(0 72% 51%)"} stopOpacity={0.3} />
                <stop offset="95%" stopColor={isPositive ? "hsl(142 71% 45%)" : "hsl(0 72% 51%)"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 20% 18%)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(222 41% 9%)", border: "1px solid hsl(222 20% 18%)", borderRadius: "8px", fontSize: "12px" }}
              labelStyle={{ color: "hsl(210 40% 96%)" }}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke={isPositive ? "hsl(142 71% 45%)" : "hsl(0 72% 51%)"}
              fill="url(#equityGrad)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}