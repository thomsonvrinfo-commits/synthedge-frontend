import React, { useState } from "react";
import { Calendar } from "lucide-react";

export default function DateRangePicker({ onApply, disabled }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const handleApply = () => {
    if (!from || !to) return;
    const fromEpoch = Math.floor(new Date(from + "T00:00:00Z").getTime() / 1000);
    const toEpoch = Math.floor(new Date(to + "T23:59:59Z").getTime() / 1000);
    if (fromEpoch >= toEpoch) return;
    onApply(fromEpoch, toEpoch);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        disabled={disabled}
        title="Select date range"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-card/80 backdrop-blur-sm border border-border hover:bg-card transition-all"
      >
        <Calendar className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Date Range</span>
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-30 bg-card border border-border rounded-xl shadow-xl p-3 w-64 space-y-2">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full text-xs px-2 py-1.5 rounded-md bg-background border border-border"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full text-xs px-2 py-1.5 rounded-md bg-background border border-border"
            />
          </div>
          <button
            onClick={handleApply}
            className="w-full text-xs font-medium py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            Load Range
          </button>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Large ranges on low timeframes (M1/M5) may be capped — switch to H4/D1 for multi-year views.
          </p>
        </div>
      )}
    </div>
  );
}
