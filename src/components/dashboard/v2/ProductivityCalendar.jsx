import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, HelpCircle, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const BEHAVIOR_TAGS = {
  Calm: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
  Focused: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
  Patient: "text-violet-600 bg-violet-50 dark:bg-violet-950/30",
  FOMO: "text-orange-600 bg-orange-50 dark:bg-orange-950/30",
  Revenge: "text-red-600 bg-red-50 dark:bg-red-950/30",
  Impulsive: "text-red-500 bg-red-50 dark:bg-red-950/30",
  Disciplined: "text-teal-600 bg-teal-50 dark:bg-teal-950/30",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startMonday = getMonday(firstDay);

  const days = [];
  const cur = new Date(startMonday);
  while (cur <= lastDay || days.length % 7 !== 0) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
    if (cur > lastDay && days.length % 7 === 0) break;
  }
  // Ensure we have at least 5 weeks visible
  while (days.length < 35) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export default function ProductivityCalendar({ trades = [] }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(null);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // Build a day-keyed map from trades
  const dayMap = useMemo(() => {
    const map = {};
    trades.filter(t => t.source !== "backtest" && t.trade_date).forEach(t => {
      const key = t.trade_date.slice(0, 10);
      if (!map[key]) map[key] = { pl: 0, count: 0, violations: 0, emotions: [], discipline: 100 };
      map[key].pl += t.profit_loss || 0;
      map[key].count++;
      map[key].violations += t.rule_violations?.length || 0;
      if (t.emotional_state) map[key].emotions.push(t.emotional_state);
    });
    // Compute discipline per day
    Object.values(map).forEach(d => {
      d.discipline = Math.max(0, Math.min(100,
        100 - (d.violations / Math.max(d.count, 1)) * 40
      ));
      d.behavior = d.emotions.length > 0 ? d.emotions[0] : "Calm";
    });
    return map;
  }, [trades]);

  const calDays = useMemo(() => buildCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const todayKey = today.toISOString().slice(0, 10);

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Trading Productivity Calendar</h3>
          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block"/> Excellent (80+)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block"/> Average (50-79)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block"/> Poor (&lt;50)</span>
            <span className="flex items-center gap-1"><Star className="w-2.5 h-2.5 text-blue-500"/> Perfect Discipline</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-secondary transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold min-w-[110px] text-center">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-secondary transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calDays.map((day, i) => {
          const key = day.toISOString().slice(0, 10);
          const data = dayMap[key];
          const isToday = key === todayKey;
          const isCurrentMonth = day.getMonth() === viewMonth;
          const isSelected = selected === key;

          let bgClass = "bg-secondary/40 hover:bg-secondary/70";
          if (data) {
            if (data.discipline >= 80) bgClass = "bg-emerald-50 hover:bg-emerald-100";
            else if (data.discipline >= 50) bgClass = "bg-amber-50 hover:bg-amber-100";
            else bgClass = "bg-red-50 hover:bg-red-100";
          }

          return (
            <button
              key={i}
              onClick={() => setSelected(isSelected ? null : key)}
              className={cn(
                "relative rounded-xl p-1.5 text-left transition-all min-h-[72px] border",
                bgClass,
                isToday ? "ring-2 ring-primary ring-offset-1" : "border-transparent",
                isSelected ? "border-primary" : "",
                data?.discipline === 100 ? "border-blue-400" : "",
                !isCurrentMonth ? "opacity-30" : ""
              )}
            >
              <span className={cn(
                "text-[11px] font-semibold",
                isToday ? "text-primary" : "text-foreground/70"
              )}>
                {day.getDate()}
                {isToday && <span className="ml-1 text-[9px] bg-primary text-primary-foreground px-1 rounded">Today</span>}
              </span>

              {data ? (
                <div className="mt-0.5 space-y-0.5">
                  <p className={cn("text-[11px] font-bold leading-tight",
                    data.pl >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {data.pl >= 0 ? "+" : ""}{data.pl.toFixed(0)}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{data.count} Trade{data.count !== 1 ? "s" : ""}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{Math.round(data.discipline)}</p>
                  {data.behavior && (
                    <span className={cn("text-[9px] px-1 py-0.5 rounded font-medium", BEHAVIOR_TAGS[data.behavior] || "text-muted-foreground bg-secondary")}>
                      {data.behavior}
                    </span>
                  )}
                </div>
              ) : isCurrentMonth ? (
                <p className="text-[10px] text-muted-foreground/50 mt-1">0 Trades</p>
              ) : null}

              {data?.discipline === 100 && (
                <Star className="absolute top-1 right-1 w-2.5 h-2.5 text-blue-500 fill-blue-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}