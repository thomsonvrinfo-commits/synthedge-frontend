import React from "react";
import { listTrades } from "@/api/trades";
import { getMyProfileAsList } from "@/api/profile";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { computeStats } from "@/lib/traderUtils";
import { useDataset } from "@/hooks/useDataset";
import { normalizeTrades } from "@/lib/tradeAdapter";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// V2 dashboard components
import DailyCommandCenter from "@/components/dashboard/v2/DailyCommandCenter";
import DashboardModeToggle from "@/components/dashboard/v2/DashboardModeToggle";
import TradingReadiness from "@/components/dashboard/v2/TradingReadiness";
import AICoachCard from "@/components/dashboard/v2/AICoachCard";
import TraderDevelopmentScoreV2 from "@/components/dashboard/v2/TraderDevelopmentScoreV2";
import TradingCalendarV2 from "@/components/dashboard/v2/TradingCalendarV2";
import EquityCurveV2 from "@/components/dashboard/v2/EquityCurveV2";
import SessionPerformanceV2 from "@/components/dashboard/v2/SessionPerformanceV2";
import TraderRadarV2 from "@/components/dashboard/v2/TraderRadarV2";
import TradingDNAV2 from "@/components/dashboard/v2/TradingDNAV2";
import AICoachButton from "@/components/dashboard/v2/AICoachButton";
import BrokerStatCards from "@/components/dashboard/v2/BrokerStatCards";

export default function Dashboard() {
  const { mode, setMode, dataset, filterTrades } = useDataset();
  const { user, isLoading: userLoading } = useCurrentUser();

  const { data: allTrades = [], isLoading } = useQuery({
    queryKey: ["trades", user?.id],
    queryFn: () => listTrades({ limit: 500 }),
    enabled: !!user?.id,
    initialData: [],
    staleTime: 5 * 60 * 1000, // 5 min — invalidated explicitly on write
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["currentProfile", user?.id], // unified key — hits same cache as useCurrentUser
    queryFn: getMyProfileAsList,
    enabled: !!user?.id,
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const profile = profiles[0];
  const normalizedAll = normalizeTrades(allTrades);
  // Filter directly on already-normalized data — filterTrades() would call
  // normalizeTrades a SECOND time (it normalizes internally), which is
  // wasteful CPU on 500 trades.
  const trades = normalizedAll.filter(t => t.dataset === dataset);
  const normalizedTrades = normalizedAll;
  const stats = computeStats(trades);
  const emptyState = !isLoading && !trades.length;

  return (
    <div className="space-y-4 max-w-[1400px] pb-16">

      {/* ── Row 1: Command Center + Mode Toggle ─────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <DailyCommandCenter user={user} profile={profile} stats={stats} tradeCount={normalizedTrades.filter(t => t.dataset === "LIVE").length} isLoading={isLoading} />
        <div className="flex-shrink-0">
          <DashboardModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>

      {/* ── Broker-synced performance (only if a broker account is linked) ── */}
      <BrokerStatCards />

      {/* ── LEVEL 1 — TODAY ─────────────────────────────────────────────── */}
      {/* Row 2: Trading Readiness · AI Coach · Trader Dev Score */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <TradingReadiness />
        <AICoachCard stats={stats} trades={trades} />
        <TraderDevelopmentScoreV2 stats={stats} trades={trades} />
      </div>

      {/* ── LEVEL 2 — HISTORY ───────────────────────────────────────────── */}
      {/* Row 3: Trading Calendar — show skeleton while loading */}
      {isLoading ? (
        <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 h-64 animate-pulse" />
      ) : (
        <TradingCalendarV2 trades={trades} />
      )}

      {/* ── LEVEL 3 — ANALYTICS ─────────────────────────────────────────── */}
      {/* Row 4: Equity Curve · Session Performance */}
      {isLoading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-card rounded-2xl border border-border/60 h-48 animate-pulse" />
          <div className="bg-card rounded-2xl border border-border/60 h-48 animate-pulse" />
        </div>
      ) : !emptyState && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <EquityCurveV2 trades={trades} mode={mode} />
          <SessionPerformanceV2 trades={trades} />
        </div>
      )}

      {/* Row 5: Trader Radar · Trader DNA */}
      {!isLoading && !emptyState && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <TraderRadarV2 trades={trades} />
          <TradingDNAV2 stats={stats} trades={trades} />
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {emptyState && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <TrendingUp className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold">No {mode === "backtest" ? "backtest" : ""} trades yet</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            {mode === "backtest"
              ? "Run backtests to see your replay performance here."
              : "Log your first live trade to unlock all dashboard insights."
            }
          </p>
          {mode === "live" && (
            <Link to="/journal" className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Log First Trade
            </Link>
          )}
          {mode === "backtest" && (
            <Link to="/backtest" className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Start Backtesting
            </Link>
          )}
        </div>
      )}

      {/* ── Floating AI Coach ────────────────────────────────────────────── */}
      <AICoachButton />
    </div>
  );
}