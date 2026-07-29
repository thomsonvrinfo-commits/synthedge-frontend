import React from "react";
import { cn } from "@/lib/utils";

export default function StatCard({ title, value, subtitle, icon: IconComp, trend, className }) {
  return (
    <div className={cn(
      "bg-card border border-border rounded-xl p-4 relative overflow-hidden group hover:border-primary/20 transition-all duration-300",
      className
    )}>
      <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-full -translate-y-6 translate-x-6 group-hover:bg-primary/8 transition-colors" />
      <div className="flex items-start justify-between relative gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">{title}</p>
          <p className="text-xl font-bold mt-1 font-mono truncate">{value}</p>
          {subtitle && (
            <p className={cn(
              "text-[11px] mt-1 font-medium truncate",
              trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground"
            )}>
              {subtitle}
            </p>
          )}
        </div>
        {IconComp && (
          <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
            <IconComp className="w-4 h-4 text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}