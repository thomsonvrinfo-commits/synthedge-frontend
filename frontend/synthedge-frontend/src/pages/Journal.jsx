import React, { useState, useMemo } from "react";
import { listTrades, deleteTrade } from "@/api/trades";
import { getMyProfileAsList } from "@/api/profile";
import { listTradingRules } from "@/api/tradingRules";
import { listReplaySessions } from "@/api/replaySessions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Upload, MoreHorizontal, BookOpen, LayoutGrid, List, Trash2, CheckSquare, Square, FlaskConical, Zap, ArrowLeft, Radio } from "lucide-react";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeStats } from "@/lib/traderUtils";
import { cn } from "@/lib/utils";
import { useDataset } from "@/hooks/useDataset";
import { useCurrentUser } from "@/hooks/useCurrentUser";


import JournalKPIBar from "@/components/journal/v2/JournalKPIBar";
import AccessGate from "@/components/subscription/AccessGate";
import TradeRowCard from "@/components/journal/v2/TradeRowCard";
import LogTradeModal from "@/components/journal/v2/LogTradeModal";
import JournalSidebar from "@/components/journal/v2/JournalSidebar";
import JournalBottomBar from "@/components/journal/v2/JournalBottomBar";
import TradeDetailModal from "@/components/journal/TradeDetailModal";
import ResearchSessions from "@/components/journal/ResearchSessions";
import BrokerTradesView from "@/components/journal/BrokerTradesView";

const RESULT_TABS = [
  { key: "all", label: "All Trades" },
  { key: "Win", label: "Wins" },
  { key: "Loss", label: "Losses" },
  { key: "Breakeven", label: "Breakeven" },
];

const REPLAY_FILTERS = [
  { key: "all", label: "All Trades" },
  { key: "quick", label: "Quick Replay" },
  { key: "research", label: "Research Sessions" },
];

export default function Journal() {
  const [showLogModal, setShowLogModal] = useState(false);
  const [editTrade, setEditTrade] = useState(null);
  const [viewTrade, setViewTrade] = useState(null);
  const [search, setSearch] = useState("");
  const [filterResult, setFilterResult] = useState("all");
  const [filterSetup, setFilterSetup] = useState("all");
  const [filterSession, setFilterSession] = useState("all");
  const [viewMode, setViewMode] = useState("grid"); // grid | list
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [replayFilter, setReplayFilter] = useState("all");
  const [brokerView, setBrokerView] = useState(false);
  const { mode, dataset, filterTrades } = useDataset();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();

  const { data: allTrades = [], isLoading } = useQuery({
    // Unified key — same as Dashboard.  Both pages fetch the same 500 trades
    // from the same endpoint, so sharing the cache means navigating between
    // Dashboard ↔ Journal is instant (was a full refetch every time because
    // the old key included `dataset`, a pure client-side filter).
    queryKey: ["trades", user?.id],
    queryFn: () => listTrades({ limit: 500 }),
    enabled: !!user?.id,
    initialData: [],
    staleTime: 5 * 60 * 1000, // 5 min — invalidated explicitly on write
    select: data => filterTrades(data),
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["currentProfile", user?.id], // unified key — hits same cache as useCurrentUser
    queryFn: getMyProfileAsList,
    enabled: !!user?.id,
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });
  const { data: rules = [] } = useQuery({
    queryKey: ["tradingRules", user?.id],
    queryFn: () => listTradingRules({ limit: 50 }),
    enabled: !!user?.id,
    initialData: [],
    staleTime: 10 * 60 * 1000, // rules rarely change
  });
  const { data: replaySessions = [] } = useQuery({
    queryKey: ["replaySessions", user?.id],
    queryFn: () => listReplaySessions({ limit: 50 }),
    enabled: !!user?.id,
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  const profile = profiles[0];
  const deleteMutation = useMutation({
    mutationFn: (id) => deleteTrade(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trades", user?.id] }),
  });

  // allTrades is already normalized + filtered by useDataset via select — do NOT re-normalize
  const journalTrades = allTrades;
  const stats = computeStats(journalTrades);
  const selectedSessionId = replayFilter.startsWith("session:") ? replayFilter.split(":")[1] : null;
  const selectedSession = replaySessions.find(s => s.id === selectedSessionId);
  const selectedSessionTrades = selectedSessionId ? journalTrades.filter(t => t.replay_session_id === selectedSessionId) : [];
  const selectedSessionStats = computeStats(selectedSessionTrades);

  const uniqueSetups = useMemo(() => [...new Set(journalTrades.map(t => t.setup).filter(Boolean))], [journalTrades]);
  const uniqueSessions = useMemo(() => [...new Set(journalTrades.map(t => t.session).filter(Boolean))], [journalTrades]);

  const filtered = useMemo(() => journalTrades.filter(t => {
    if (mode === "backtest") {
      if (replayFilter === "quick" && t.replay_session_id) return false;
      if (replayFilter.startsWith("session:") && t.replay_session_id !== selectedSessionId) return false;
    }
    if (filterResult !== "all" && t.result !== filterResult) return false;
    if (filterSetup !== "all" && t.setup !== filterSetup) return false;
    if (filterSession !== "all" && t.session !== filterSession) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.symbol?.toLowerCase().includes(q) ||
        t.setup?.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q) ||
        t.result?.toLowerCase().includes(q)
      );
    }
    return true;
  }), [journalTrades, mode, replayFilter, selectedSessionId, filterResult, filterSetup, filterSession, search]);

  const wins = filtered.filter(t => t.result === "Win").length;
  const losses = filtered.filter(t => t.result === "Loss").length;
  const be = filtered.filter(t => t.result === "Breakeven").length;

  const handleEdit = (trade) => { setEditTrade(trade); setViewTrade(null); setShowLogModal(true); };
  const handleDelete = (trade) => { if (confirm("Delete this trade?")) deleteMutation.mutate(trade.id); };

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(t => t.id)));
  };
  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} trade${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    await Promise.all([...selectedIds].map(id => deleteTrade(id)));
    setSelectedIds(new Set());
    setBulkDeleting(false);
    queryClient.invalidateQueries({ queryKey: ["trades", user?.id] });
  };

  return (
    <AccessGate feature="Trading Journal">
    <div className="space-y-4 pb-20">
      {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Trading Journal</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "backtest" ? "Practice, test and refine your edge." : "Capture every trade. Build your edge."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Global mode indicator — read-only, controlled by Dashboard toggle */}
          <div className="flex items-center bg-card border border-border/60 rounded-xl overflow-hidden text-xs font-semibold">
            <div className={cn("flex items-center gap-1.5 px-3 py-1.5 transition-colors",
              mode === "live" ? "bg-emerald-500/15 text-emerald-500" : "text-muted-foreground/40"
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              LIVE
            </div>
            <div className={cn("flex items-center gap-1.5 px-3 py-1.5 transition-colors",
              mode === "backtest" ? "bg-primary/15 text-primary" : "text-muted-foreground/40"
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              BACKTEST
            </div>
          </div>
          <button className="w-9 h-9 rounded-xl border border-border/60 bg-card flex items-center justify-center hover:bg-secondary transition-colors" title="Import">
            <Upload className="w-4 h-4 text-muted-foreground" />
          </button>
          <button className="w-9 h-9 rounded-xl border border-border/60 bg-card flex items-center justify-center hover:bg-secondary transition-colors" title="More">
            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
          </button>
          {mode === "live" && (
            <button
              onClick={() => { setEditTrade(null); setShowLogModal(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Log Trade
            </button>
          )}
          <button
            onClick={() => setBrokerView(p => !p)}
            className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors",
              brokerView ? "bg-primary text-primary-foreground" : "bg-card border border-border/60 text-muted-foreground hover:text-foreground")}
          >
            <Radio className="w-4 h-4" /> Broker
          </button>
        </div>
      </div>

      {/* ── KPI BAR ─────────────────────────────────────────────────────── */}
      {journalTrades.length > 0 && <JournalKPIBar stats={stats} trades={journalTrades} />}

      {/* ── REPLAY FILTER (backtest mode only) ─────────────────────────── */}
      {mode === "backtest" && (
        <div className="flex items-center gap-2 flex-wrap">
          {REPLAY_FILTERS.map(f => {
            const isActive = f.key === "research"
              ? (replayFilter === "research" || replayFilter.startsWith("session:"))
              : replayFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setReplayFilter(f.key)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border/60 text-muted-foreground hover:text-foreground"
                )}
              >
                {f.key === "quick" && <Zap className="w-3 h-3" />}
                {f.key === "research" && <FlaskConical className="w-3 h-3" />}
                {f.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── SESSION DETAIL HEADER (when a specific session is selected) ── */}
      {selectedSession && (
        <div className="bg-card border border-border/60 rounded-xl p-4 space-y-4">
          {/* Session Overview */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setReplayFilter("research")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> All Sessions
            </button>
            <div className="flex items-center gap-2">
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                selectedSession.status === "completed" ? "bg-muted text-muted-foreground" : "bg-success/15 text-success"
              )}>
                {selectedSession.status === "completed" ? "Completed" : "Active"}
              </span>
              <Link
                to={`/backtest/replay?session=${selectedSession.id}`}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
              >
                <FlaskConical className="w-3 h-3" /> Continue Session
              </Link>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-bold">{selectedSession.name || "Untitled Session"}</h2>
            {selectedSession.objective && <p className="text-sm text-muted-foreground">{selectedSession.objective}</p>}
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Started {selectedSession.started_at
                ? new Date(selectedSession.started_at).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })
                : selectedSession.created_date
                ? new Date(selectedSession.created_date).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })
                : "—"}
            </p>
          </div>

          {/* Session Details */}
          {(selectedSession.strategy_name || selectedSession.rules_being_tested?.length || selectedSession.notes) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
              {selectedSession.strategy_name && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Strategy</p>
                  <p className="text-sm font-medium">{selectedSession.strategy_name}</p>
                </div>
              )}
              {selectedSession.rules_being_tested?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Rules Tested</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSession.rules_being_tested.map((r, i) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selectedSession.notes && !selectedSession.conclusion && (
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedSession.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Session Statistics */}
          <div className="grid grid-cols-4 gap-3 pt-2 border-t border-border/40">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Trades</p>
              <p className="text-lg font-bold">{selectedSessionStats.total}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Win Rate</p>
              <p className="text-lg font-bold">{selectedSessionStats.total > 0 ? `${selectedSessionStats.winRate}%` : "—"}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Avg RR</p>
              <p className="text-lg font-bold">{selectedSessionStats.total > 0 ? selectedSessionStats.avgRR : "—"}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Total P/L</p>
              <p className={cn("text-lg font-bold", selectedSessionStats.totalPL > 0 ? "text-success" : selectedSessionStats.totalPL < 0 ? "text-destructive" : "")}>
                {selectedSessionStats.total > 0 ? selectedSessionStats.totalPL.toFixed(2) : "—"}
              </p>
            </div>
          </div>

          {/* Session Reflection */}
          {selectedSession.conclusion && (() => {
            const notes = selectedSession.notes || "";
            const whatWorked = notes.match(/What worked:\s*([\s\S]*?)(?=\n\nWhat failed:|$)/)?.[1]?.trim();
            const whatFailed = notes.match(/What failed:\s*([\s\S]*?)(?=\n\nNext to test:|$)/)?.[1]?.trim();
            const nextSteps = notes.match(/Next to test:\s*([\s\S]*?)$/)?.[1]?.trim();
            return (
              <div className="space-y-3 pt-2 border-t border-border/40">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Session Reflection</p>
                <div className="bg-background/50 rounded-lg p-3 space-y-2">
                  <div>
                    <p className="text-[10px] font-semibold text-primary mb-0.5">Conclusion</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedSession.conclusion}</p>
                  </div>
                  {whatWorked && (
                    <div>
                      <p className="text-[10px] font-semibold text-success mb-0.5">What Worked</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{whatWorked}</p>
                    </div>
                  )}
                  {whatFailed && (
                    <div>
                      <p className="text-[10px] font-semibold text-destructive mb-0.5">What Failed</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{whatFailed}</p>
                    </div>
                  )}
                  {nextSteps && (
                    <div>
                      <p className="text-[10px] font-semibold text-warning mb-0.5">Next to Test</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{nextSteps}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────  */}
      {brokerView ? (
        <BrokerTradesView />
      ) : (
      <div className="flex gap-4">
        {replayFilter === "research" ? (
        <div className="flex-1 min-w-0">
          <ResearchSessions
            sessions={replaySessions}
            trades={journalTrades}
            onSelectSession={(id) => setReplayFilter(`session:${id}`)}
          />
        </div>
        ) : (
        <>
        {/* Left: Trade Feed */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Bulk selection bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-xl text-sm">
              <span className="font-semibold text-destructive">{selectedIds.size} selected</span>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {bulkDeleting ? "Deleting..." : `Delete ${selectedIds.size}`}
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          )}

          {/* Search & Filter Bar */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search trades, setups, notes..."
                className="w-full h-9 bg-card border border-border/60 rounded-xl pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors"
              />
            </div>
            <Select value={filterSetup} onValueChange={setFilterSetup}>
              <SelectTrigger className="w-32 h-9 bg-card border-border/60 text-xs rounded-xl"><SelectValue placeholder="All Setups" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Setups</SelectItem>
                {uniqueSetups.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSession} onValueChange={setFilterSession}>
              <SelectTrigger className="w-32 h-9 bg-card border-border/60 text-xs rounded-xl"><SelectValue placeholder="All Sessions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sessions</SelectItem>
                {uniqueSessions.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* View toggle + select all */}
            <div className="flex bg-card border border-border/60 rounded-xl overflow-hidden">
              <button onClick={() => setViewMode("grid")} className={cn("px-3 py-2 transition-colors", viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode("list")} className={cn("px-3 py-2 transition-colors", viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                <List className="w-4 h-4" />
              </button>
            </div>
            {filtered.length > 0 && (
              <button onClick={toggleSelectAll} title="Select all" className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border/60 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors">
                {selectedIds.size === filtered.length && filtered.length > 0
                  ? <CheckSquare className="w-4 h-4 text-primary" />
                  : <Square className="w-4 h-4" />}
                <span className="hidden sm:inline">Select</span>
              </button>
            )}
          </div>

          {/* Result filter tabs */}
          {journalTrades.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {RESULT_TABS.map(tab => (
                <button key={tab.key} onClick={() => setFilterResult(tab.key)}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all",
                    filterResult === tab.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border/60 text-muted-foreground hover:text-foreground"
                  )}>
                  {tab.key === "Win" && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                  {tab.key === "Loss" && <span className="w-2 h-2 rounded-full bg-destructive" />}
                  {tab.key === "Breakeven" && <span className="w-2 h-2 rounded-full bg-warning" />}
                  {tab.label}
                  <span className="opacity-60 font-mono text-[10px]">
                    {tab.key === "all" ? filtered.length : tab.key === "Win" ? wins : tab.key === "Loss" ? losses : be}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Trade Grid / List */}
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 text-center bg-card border border-border/60 rounded-2xl">
              <BookOpen className="w-10 h-10 text-muted-foreground/20 mb-3" />
              <h3 className="font-semibold">
                {journalTrades.length === 0 ? "No trades logged yet" : "No trades match your filters"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                {journalTrades.length === 0
                  ? mode === "backtest"
                    ? "Run trades in the Replay environment — they will automatically appear here."
                    : "Log your first trade to start building your trading intelligence."
                  : "Try adjusting your search or filters."}
              </p>
              {journalTrades.length === 0 && mode === "live" && (
                <button onClick={() => setShowLogModal(true)} className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
                  Log First Trade
                </button>
              )}
            </div>
          ) : (
            <div className={cn(viewMode === "grid" ? "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3" : "space-y-2")}>
              {filtered.map(trade => (
                <TradeRowCard
                  key={trade.id}
                  trade={trade}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onView={selectedIds.size > 0 ? () => toggleSelect(trade.id) : setViewTrade}
                  selected={selectedIds.has(trade.id)}
                  onSelect={selectedIds.size > 0 ? () => toggleSelect(trade.id) : undefined}
                />
              ))}
            </div>
          )}

          {/* Bottom bar */}
          {journalTrades.length > 0 && <JournalBottomBar trades={journalTrades} />}
        </div>

        {/* Right Sidebar */}
        <div className="hidden xl:block w-64 flex-shrink-0">
          <JournalSidebar stats={stats} trades={journalTrades} />
        </div>
        </>
        )}
      </div>
      )}

      {/* Log Trade Modal */}
      <LogTradeModal
        open={showLogModal}
        onClose={() => { setShowLogModal(false); setEditTrade(null); }}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["trades", user?.id] })}
        editTrade={editTrade}
        profile={profile}
        rules={rules}
      />

      {/* Trade Detail Modal */}
      <TradeDetailModal
        trade={viewTrade}
        open={!!viewTrade}
        onClose={() => setViewTrade(null)}
        onEdit={handleEdit}
      />
    </div>
    </AccessGate>
  );
}