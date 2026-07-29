import React, { useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const FACTORS = [
  { key: "confidence", label: "Confidence", emoji: "💪", color: "#3b82f6" },
  { key: "focus",      label: "Focus",      emoji: "🎯", color: "#8b5cf6" },
  { key: "sleep",      label: "Sleep",      emoji: "🌙", color: "#06b6d4" },
  { key: "stress",     label: "Stress",     emoji: "⚡", color: "#ef4444", invert: true },
];

function CircleScore({ score, size = 100 }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? "#22c55e" : score >= 45 ? "#f59e0b" : "#ef4444";
  const label = score >= 70 ? "High Readiness" : score >= 45 ? "Moderate Readiness" : "Low Readiness";

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="7" />
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke={color} strokeWidth="7"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums">{score}</span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
      </div>
      <span className="text-xs font-semibold mt-2" style={{ color }}>{label}</span>
    </div>
  );
}

export default function ReadinessCard() {
  const [scores, setScores] = useState({ confidence: 7, focus: 7, sleep: 7, stress: 3 });

  const readiness = Math.round(
    (scores.confidence * 10 + scores.focus * 10 + scores.sleep * 10 + (10 - scores.stress) * 10) / 4
  );

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Today's Readiness</h3>
        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
      </div>

      <div className="flex gap-4 items-center">
        <CircleScore score={readiness} size={108} />
        <div className="flex-1 space-y-2.5">
          {FACTORS.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground w-24">
                <span>{f.emoji}</span>
                <span>{f.label}</span>
              </div>
              <div className="flex items-center gap-1">
                {[1,2,3,4,5,6,7,8,9,10].map((v) => (
                  <button
                    key={v}
                    onClick={() => setScores(s => ({ ...s, [f.key]: v }))}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      v <= scores[f.key]
                        ? "opacity-100"
                        : "opacity-20 hover:opacity-50"
                    )}
                    style={{ backgroundColor: v <= scores[f.key] ? f.color : "hsl(var(--border))" }}
                  />
                ))}
                <span className="text-[11px] font-mono w-8 text-right text-muted-foreground">{scores[f.key]}/10</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Button variant="outline" size="sm" className="w-full text-xs h-8 border-primary/30 text-primary hover:bg-primary/5">
        Update Check-In
      </Button>
    </div>
  );
}