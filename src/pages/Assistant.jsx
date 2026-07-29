import React, { useState } from "react";
import { listTrades } from "@/api/trades";
import { getMyProfileAsList } from "@/api/profile";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Sparkles, Info, ArrowLeft, Lock, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { computeStats } from "@/lib/traderUtils";
import { subDays, isAfter } from "date-fns";
import { useDataset } from "@/hooks/useDataset";
import { useProAccess } from "@/hooks/useProAccess";
import { useCurrentUser } from "@/hooks/useCurrentUser";

import KPICard from "@/components/intelligence/KPICard";
import Section1ExecSummary from "@/components/intelligence/Section1ExecSummary";
import Section2PerformanceIntel from "@/components/intelligence/Section2PerformanceIntel";
import Section3BehavioralIntel from "@/components/intelligence/Section3BehavioralIntel";
import Section4TradingDNA from "@/components/intelligence/Section4TradingDNA";
import Section5ActionPlan from "@/components/intelligence/Section5ActionPlan";
import Section6GrowthTimeline from "@/components/intelligence/Section6GrowthTimeline";
import Section7Achievements from "@/components/intelligence/Section7Achievements";

export default function Assistant() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { filterTrades } = useDataset();
  const { isPro, isLoading: subLoading } = useProAccess();
  const { user, isLoading: userLoading } = useCurrentUser();

  const { data: allTrades = [], isLoading, isFetching } = useQuery({
    queryKey: ["trades", refreshKey, user?.id],
    queryFn: () => listTrades({ limit: 500 }),
    enabled: !!user?.id,
    staleTime: 30 * 1000,
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["traderProfile", user?.id],
    queryFn: getMyProfileAsList,
    enabled: !!user?.id,
    initialData: [],
  });

  // filterTrades normalizes + filters by dataset — do NOT re-normalize
  const trades = filterTrades(allTrades);
  const stats = computeStats(trades);

  // KPI change vs last 30 days — use canonical createdAt
  const last30 = trades.filter(t => t.createdAt && isAfter(new Date(t.createdAt), subDays(new Date(), 30)));
  const prev30 = trades.filter(t => t.createdAt && isAfter(new Date(t.createdAt), subDays(new Date(), 60)) && !isAfter(new Date(t.createdAt), subDays(new Date(), 30)));
  const last30Stats = computeStats(last30);
  const prev30Stats = computeStats(prev30);
  const wrChange = prev30Stats.total > 0 ? parseFloat((last30Stats.winRate - prev30Stats.winRate).toFixed(1)) : 0;
  const discChange = prev30Stats.total > 0 ? parseFloat((last30Stats.disciplineScore - prev30Stats.disciplineScore).toFixed(0)) : 0;
  const execChange = prev30Stats.total > 0 ? parseFloat((last30Stats.avgExecution - prev30Stats.avgExecution).toFixed(1)) : 0;
  const rrChange = prev30Stats.total > 0 ? parseFloat((last30Stats.avgRR - prev30Stats.avgRR).toFixed(2)) : 0;

  if (subLoading || isLoading || isFetching || userLoading || allTrades === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mb-4">
          <Lock className="w-7 h-7 text-warning" />
        </div>
        <h3 className="font-bold text-lg">Pro Feature</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          Trading Intelligence is available on SynthEdge Pro. Upgrade to unlock AI-powered analysis of your trades.
        </p>
        <Link to="/upgrade" className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Crown className="w-4 h-4" /> Upgrade to Pro
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1300px] pb-20 space-y-4">
      {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black">Trading Intelligence</h1>
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              <Sparkles className="w-3 h-3" /> AI Coach Report
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Your complete AI-powered trading analysis and actionable coaching.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-500">LIVE DATA</span>
          </div>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh AI Analysis
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/40 border border-border/50 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 flex-shrink-0" />
        All insights are generated from your currently selected dataset.
      </div>

      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Sparkles className="w-7 h-7 text-primary" />
          </div>
          <h3 className="font-bold text-lg">No data to analyze yet</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">Start logging trades in your journal. Once you have trades, the AI will analyze your patterns and provide actionable coaching.</p>
          <Link to="/journal" className="mt-5 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            Log Your First Trade
          </Link>
        </div>
      ) : (
        <>
          {/* ── TOP KPI ROW ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard label="Win Rate" value={stats.winRate} max={100} displayValue={`${stats.winRate}%`} change={wrChange} color="hsl(142 71% 45%)" />
            <KPICard label="Discipline Score" value={stats.disciplineScore} max={100} displayValue={`${Math.round(stats.disciplineScore)}`} change={discChange} color="hsl(217 91% 60%)" suffix=" /100" />
            <KPICard label="Avg Execution" value={stats.avgExecution * 10} max={100} displayValue={`${stats.avgExecution}`} change={execChange} color="hsl(45 93% 47%)" suffix=" /10" />
            <KPICard label="Average RR" value={Math.min(100, stats.avgRR * 33)} max={100} displayValue={`${stats.avgRR}R`} change={rrChange} color="hsl(280 65% 60%)" />
          </div>

          {/* ── SECTION 1: AI EXECUTIVE SUMMARY ────────────────────────── */}
          <Section1ExecSummary stats={stats} trades={trades} />

          {/* ── SECTIONS 2 + 3: PERFORMANCE + BEHAVIORAL ───────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Section2PerformanceIntel stats={stats} trades={trades} />
            <Section3BehavioralIntel stats={stats} trades={trades} />
          </div>

          {/* ── SECTION 4: TRADING DNA ──────────────────────────────────── */}
          <Section4TradingDNA stats={stats} trades={trades} />

          {/* ── SECTIONS 5 + 6: ACTION PLAN + GROWTH TIMELINE ─────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Section5ActionPlan stats={stats} trades={trades} />
            <Section6GrowthTimeline trades={trades} />
          </div>

          {/* ── SECTION 7: ACHIEVEMENTS ─────────────────────────────────── */}
          <Section7Achievements trades={trades} />

          {/* ── FOOTER ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between p-4 bg-card/50 border border-border/60 rounded-2xl">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>💡</span>
              <span>Remember: Small actions every day lead to massive results over time. Stay consistent, trust your plan, and let the process work.</span>
            </div>
            <Link to="/" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors flex-shrink-0 ml-3">
              <ArrowLeft className="w-3 h-3" /> Back to Dashboard
            </Link>
          </div>
        </>
      )}
    </div>
  );
}