import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { EMOTION_COLORS } from "@/lib/traderUtils";
import { cn } from "@/lib/utils";

export default function EmotionAnalysis({ emotionMap }) {
  if (!emotionMap || !Object.keys(emotionMap).length) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3">Emotional Analysis</h3>
        <p className="text-xs text-muted-foreground">No emotional data yet. Track your emotions when logging trades.</p>
      </div>
    );
  }

  const data = Object.entries(emotionMap).map(([emotion, s]) => ({
    emotion: emotion.length > 8 ? emotion.slice(0, 8) + "…" : emotion,
    fullEmotion: emotion,
    winRate: parseFloat(((s.wins / s.total) * 100).toFixed(1)),
    total: s.total,
  })).sort((a, b) => b.total - a.total);

  const badEmotions = ["FOMO", "Revenge", "Anxious", "Frustrated", "Fearful"];

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-4">Emotional Analysis</h3>
      <div className="h-36 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={20}>
            <XAxis dataKey="emotion" tick={{ fontSize: 9, fill: "hsl(215 20% 55%)" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(215 20% 55%)" }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v, n, p) => [`${v}% WR (${p.payload.total}T)`, "Win Rate"]}
              contentStyle={{ backgroundColor: "hsl(222 41% 9%)", border: "1px solid hsl(222 20% 18%)", borderRadius: "8px", fontSize: "11px" }}
            />
            <Bar dataKey="winRate" radius={[4, 4, 0, 0]}
              fill="hsl(217 91% 60%)"
              label={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {data.slice(0, 4).map(d => (
          <div key={d.fullEmotion} className={cn(
            "flex items-center justify-between p-2 rounded-lg",
            badEmotions.includes(d.fullEmotion) ? "bg-destructive/10" : "bg-secondary/50"
          )}>
            <span className={cn("text-xs font-medium", EMOTION_COLORS[d.fullEmotion] || "text-foreground")}>
              {d.fullEmotion}
            </span>
            <span className="text-xs font-mono text-muted-foreground">{d.winRate}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}