import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { BarChart2, ChevronDown, Check } from "lucide-react";
import { INDICATOR_CATALOG } from "@/lib/indicatorEngine";

const CATEGORIES = ["Trend", "Momentum", "Volatility", "Volume"];

export default function IndicatorMenu({ activeIds, onChange }) {
  const [open, setOpen] = useState(false);

  const toggle = (id) => {
    if (activeIds.includes(id)) {
      onChange(activeIds.filter(x => x !== id));
    } else {
      onChange([...activeIds, id]);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all",
          open
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card border-border text-muted-foreground hover:text-foreground"
        )}
      >
        <BarChart2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Indicators</span>
        {activeIds.length > 0 && (
          <span className="bg-primary/20 text-primary px-1 rounded text-[10px]">{activeIds.length}</span>
        )}
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-2xl p-3 min-w-[220px]">
            {CATEGORIES.map(cat => {
              const items = Object.values(INDICATOR_CATALOG).filter(i => i.category === cat);
              if (!items.length) return null;
              return (
                <div key={cat} className="mb-3 last:mb-0">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider px-1 mb-1">
                    {cat}
                  </p>
                  {items.map(ind => (
                    <button
                      key={ind.id}
                      onClick={() => toggle(ind.id)}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs hover:bg-secondary transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: ind.color }}
                        />
                        <span className={activeIds.includes(ind.id) ? "text-foreground" : "text-muted-foreground"}>
                          {ind.label}
                        </span>
                      </div>
                      {activeIds.includes(ind.id) && (
                        <Check className="w-3 h-3 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}