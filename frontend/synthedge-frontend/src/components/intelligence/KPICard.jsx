import React from "react";
import { cn } from "@/lib/utils";

function Ring({ value, max = 100, color }) {
  const r = 28, circ = 2 * Math.PI * r;
  const offset = circ - Math.min(1, value / max) * circ;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
      <circle cx="36" cy="36" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s ease" }} />
    </svg>
  );
}

export default function KPICard({ label, value, displayValue, max = 100, change, color = "hsl(var(--primary))", suffix = "" }) {
  const isPos = change >= 0;
  return (
    <div className="bg-card/80 border border-border/60 rounded-2xl p-4 flex items-center gap-3">
      <div className="relative flex-shrink-0">
        <Ring value={value} max={max} color={color} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-bold text-muted-foreground">{Math.round((value / max) * 100)}%</span>
        </div>
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-2xl font-black">{displayValue ?? value}{suffix}</p>
        {change !== undefined && (
          <p className={cn("text-[11px] font-semibold", isPos ? "text-emerald-500" : "text-destructive")}>
            {isPos ? "↑" : "↓"} {Math.abs(change)}% vs last 30 days
          </p>
        )}
      </div>
    </div>
  );
}