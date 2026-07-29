import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, startOfDay } from "date-fns";

export default function TradeFrequencyChart({ trades }) {
  if (!trades || trades.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold mb-4">Trade Frequency</h3>
        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
          No trade data yet
        </div>
      </div>
    );
  }

  const grouped = {};
  trades.filter(t => t.trade_date).forEach(t => {
    const day = format(startOfDay(new Date(t.trade_date)), "MMM d");
    if (!grouped[day]) grouped[day] = { date: day, wins: 0, losses: 0, be: 0 };
    if (t.result === "Win") grouped[day].wins++;
    else if (t.result === "Loss") grouped[day].losses++;
    else grouped[day].be++;
  });

  const data = Object.values(grouped).slice(-14);

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h3 className="text-sm font-semibold mb-4">Trade Frequency (Last 14 Days)</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 20% 18%)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(222 41% 9%)", border: "1px solid hsl(222 20% 18%)", borderRadius: "8px", fontSize: "12px" }}
            />
            <Bar dataKey="wins" stackId="a" fill="hsl(142 71% 45%)" radius={[0, 0, 0, 0]} name="Wins" />
            <Bar dataKey="losses" stackId="a" fill="hsl(0 72% 51%)" radius={[0, 0, 0, 0]} name="Losses" />
            <Bar dataKey="be" stackId="a" fill="hsl(45 93% 47%)" radius={[4, 4, 0, 0]} name="BE" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}