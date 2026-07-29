import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export default function WinLossChart({ trades }) {
  const wins = trades.filter(t => t.result === "Win").length;
  const losses = trades.filter(t => t.result === "Loss").length;
  const be = trades.filter(t => t.result === "Breakeven").length;

  const data = [
    { name: "Wins", value: wins, color: "hsl(142 71% 45%)" },
    { name: "Losses", value: losses, color: "hsl(0 72% 51%)" },
    { name: "Breakeven", value: be, color: "hsl(45 93% 47%)" },
  ].filter(d => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold mb-4">Win / Loss</h3>
        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
          No trade data yet
        </div>
      </div>
    );
  }

  const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : 0;

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h3 className="text-sm font-semibold mb-4">Win / Loss</h3>
      <div className="h-48 flex items-center">
        <div className="w-1/2 h-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(222 41% 9%)", border: "1px solid hsl(222 20% 18%)", borderRadius: "8px", fontSize: "12px" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-1/2 space-y-3">
          <div className="text-center">
            <p className="text-3xl font-bold font-mono">{winRate}%</p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
          <div className="space-y-1.5">
            {data.map(d => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-muted-foreground">{d.name}</span>
                </div>
                <span className="font-mono font-medium">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}