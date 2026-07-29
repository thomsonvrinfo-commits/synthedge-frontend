import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeCalendarDays } from "@/lib/analyticsEngine";
import { useIsMobile } from "@/hooks/use-mobile";

const DAYS_DESKTOP = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_MOBILE  = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startMonday = getMonday(firstDay);
  const days = [];
  const cur = new Date(startMonday);
  while (cur <= lastDay || days.length % 7 !== 0) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
    if (cur > lastDay && days.length % 7 === 0) break;
  }
  while (days.length < 35) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  return days;
}

export default function TradingCalendarV2({ trades = [] }) {
  const today    = new Date();
  const isMobile = useIsMobile();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0);  setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const dayMap  = useMemo(() => computeCalendarDays(trades), [trades]);
  const calDays = useMemo(() => buildCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const monthTrades = trades.filter(t => {
    const ts = t.trade_date || t.createdAt;
    if (!ts) return false;
    const d = new Date(ts);
    return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
  });
  const monthPL = monthTrades.reduce((s, t) => s + (t.pl ?? 0), 0);
  const monthWR = monthTrades.length
    ? Math.round((monthTrades.filter(t => t.result === "Win").length / monthTrades.length) * 100)
    : 0;
  const rrTrades = monthTrades.filter(t => t.rr != null);
  const monthRR  = rrTrades.length
    ? (rrTrades.reduce((s, t) => s + t.rr, 0) / rrTrades.length).toFixed(1)
    : "—";

  const DAYS = isMobile ? DAYS_MOBILE : DAYS_DESKTOP;

  // ── Stat item ──────────────────────────────────────────────────────────────
  const StatItem = ({ label, value, valueClass }) => (
    <div className={cn(
      "flex flex-col",
      isMobile
        ? "bg-secondary/40 rounded-xl px-3 py-2"
        : ""
    )}>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn("font-black leading-tight", isMobile ? "text-sm" : "text-base", valueClass)}>{value}</p>
      <p className="text-[9px] text-muted-foreground">This Month</p>
    </div>
  );

  // ── Calendar day cell ──────────────────────────────────────────────────────
  const DayCell = ({ day, i }) => {
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const data = dayMap[key];
    const isToday = key === todayKey;
    const isCurrentMonth = day.getMonth() === viewMonth;
    const dailyValue = data ? (data.dailyPL || data.dailyRR || 0) : 0;
    const isProfit = data && dailyValue > 0;
    const isLoss   = data && dailyValue < 0;

    const plLabel = data?.dailyPL
      ? `${data.dailyPL >= 0 ? "+" : ""}$${Math.abs(data.dailyPL).toFixed(0)}`
      : data?.dailyRR != null
        ? `${data.dailyRR >= 0 ? "+" : ""}${data.dailyRR.toFixed(1)}R`
        : null;

    return (
      <div
        key={i}
        className={cn(
          "rounded-lg border transition-colors",
          isMobile ? "min-h-[52px] p-1" : "min-h-[56px] p-1",
          isProfit ? "bg-emerald-500/10 border-emerald-500/20" :
          isLoss   ? "bg-destructive/10 border-destructive/20" :
                     "bg-secondary/20 border-transparent",
          isToday ? "ring-2 ring-primary ring-offset-1" : "",
          !isCurrentMonth ? "opacity-25" : ""
        )}
      >
        {/* Date number */}
        <span className={cn(
          "font-semibold leading-none",
          isMobile ? "text-[11px]" : "text-[10px]",
          isToday ? "text-primary" : "text-foreground/70"
        )}>
          {day.getDate()}
          {isToday && <span className="ml-0.5 text-[8px] bg-primary text-primary-foreground px-0.5 rounded">●</span>}
        </span>

        {/* Trade data */}
        {data && isCurrentMonth ? (
          <div className="mt-0.5">
            <p className={cn(
              "font-bold leading-tight",
              isMobile ? "text-[10px]" : "text-[10px]",
              isProfit ? "text-emerald-500" : "text-destructive"
            )}>
              {plLabel}
            </p>
            <p className="text-[9px] text-muted-foreground">
              {data.count}{isMobile ? "T" : ` Trade${data.count !== 1 ? "s" : ""}`}
            </p>
          </div>
        ) : null /* hide "0 Trades" noise */ }
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 space-y-3">

      {/* Header row — month navigator */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Trading Calendar</h3>
          <p className="text-[11px] text-muted-foreground">Overview of your trading activity</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-secondary transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold min-w-[110px] text-center">
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-secondary transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats — horizontal 2×2 grid on mobile, vertical sidebar on desktop */}
      {isMobile ? (
        <div className="grid grid-cols-4 gap-2">
          <StatItem
            label="Net P/L"
            value={`${monthPL >= 0 ? "+" : ""}$${Math.abs(monthPL).toFixed(0)}`}
            valueClass={monthPL >= 0 ? "text-emerald-500" : "text-destructive"}
          />
          <StatItem label="Trades" value={monthTrades.length} valueClass="text-primary" />
          <StatItem label="Win Rate" value={`${monthWR}%`} valueClass="text-foreground" />
          <StatItem label="Avg RR" value={`${monthRR}R`} valueClass="text-foreground" />
        </div>
      ) : null}

      {/* Calendar grid + optional desktop sidebar */}
      <div className={cn(isMobile ? "" : "flex gap-4")}>

        {/* Desktop stats sidebar */}
        {!isMobile && (
          <div className="flex flex-col gap-3 w-24 flex-shrink-0">
            <StatItem
              label="Net P/L"
              value={`${monthPL >= 0 ? "+" : ""}$${Math.abs(monthPL).toFixed(0)}`}
              valueClass={monthPL >= 0 ? "text-emerald-500" : "text-destructive"}
            />
            <StatItem label="Total Trades" value={monthTrades.length} valueClass="text-primary" />
            <StatItem label="Win Rate" value={`${monthWR}%`} valueClass="text-foreground" />
            <StatItem label="Avg RR" value={`${monthRR}R`} valueClass="text-foreground" />
          </div>
        )}

        {/* Calendar grid */}
        <div className="flex-1 min-w-0">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DAYS.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {calDays.map((day, i) => <DayCell key={i} day={day} i={i} />)}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40 flex-wrap gap-1">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40 inline-block"/>
            Profit Day
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-destructive/40 inline-block"/>
            Loss Day
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-secondary inline-block"/>
            No Trading
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground hidden sm:block">P/L shown in account currency</span>
      </div>
    </div>
  );
}
