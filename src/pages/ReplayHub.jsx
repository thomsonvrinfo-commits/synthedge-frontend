import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listTrades } from "@/api/trades";
import {
  listReplaySessions,
  createReplaySession,
  updateReplaySession,
  deleteReplaySession,
} from "@/api/replaySessions";
import {
  Zap,
  FlaskConical,
  Plus,
  ArrowRight,
  CheckCircle2,
  Clock,
  Trash2,
  CheckCheck,
  RotateCcw,
  X,
  CheckSquare,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { computeStats } from "@/lib/traderUtils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import SessionCard from "@/components/backtest/SessionCard";
import SessionCreateForm from "@/components/backtest/SessionCreateForm";

export default function ReplayHub() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchAction, setBatchAction] = useState(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ["replaySessions", user?.id],
    queryFn: () => listReplaySessions({ limit: 50 }),
    enabled: !!user?.id,
    initialData: [],
  });

  const { data: trades = [] } = useQuery({
    queryKey: ["backtestTrades", user?.id],
    queryFn: () => listTrades({ dataset: "BACKTEST", limit: 500 }),
    enabled: !!user?.id,
    initialData: [],
  });

  const handleQuickReplay = () => navigate("/backtest/replay");

  const handleCreateSession = async (formData) => {
    setCreating(true);
    try {
      const session = await createReplaySession({
        ...formData,
        status: "active",
        started_at: new Date().toISOString(),
        index_name: "Volatility 75",
        granularity: 3600,
      });
      queryClient.invalidateQueries({ queryKey: ["replaySessions", user?.id] });
      navigate(`/backtest/replay?session=${session.id}`);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
    setCreating(false);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(sessions.map(s => s.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const handleBatchDelete = async () => {
    const count = selectedIds.size;
    if (!count) return;
    if (!confirm(`Delete ${count} session${count !== 1 ? "s" : ""}?\n\nThis action cannot be undone. Trade records will NOT be deleted.`)) return;
    setBatchAction("delete");
    try {
      await Promise.all([...selectedIds].map(id => deleteReplaySession(id)));
      queryClient.invalidateQueries({ queryKey: ["replaySessions", user?.id] });
      clearSelection();
    } catch (err) {
      console.error("Batch delete failed:", err);
    }
    setBatchAction(null);
  };

  const handleBatchComplete = async () => {
    const count = selectedIds.size;
    if (!count) return;
    if (!confirm(`Mark ${count} session${count !== 1 ? "s" : ""} as completed?`)) return;
    setBatchAction("complete");
    try {
      const now = new Date().toISOString();
      await Promise.all(
        [...selectedIds].map(id =>
          updateReplaySession(id, {
            status: "completed",
            completed: true,
            completed_at: now,
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: ["replaySessions", user?.id] });
      clearSelection();
    } catch (err) {
      console.error("Batch complete failed:", err);
    }
    setBatchAction(null);
  };

  const handleBatchReopen = async () => {
    const count = selectedIds.size;
    if (!count) return;
    if (!confirm(`Reopen ${count} session${count !== 1 ? "s" : ""}?`)) return;
    setBatchAction("reopen");
    try {
      await Promise.all(
        [...selectedIds].map(id =>
          updateReplaySession(id, {
            status: "active",
            completed: false,
            completed_at: null,
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: ["replaySessions", user?.id] });
      clearSelection();
    } catch (err) {
      console.error("Batch reopen failed:", err);
    }
    setBatchAction(null);
  };

  const handleDeleteSingle = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Delete this session?\n\nThis action cannot be undone. Trade records will NOT be deleted.")) return;
    await deleteReplaySession(id);
    queryClient.invalidateQueries({ queryKey: ["replaySessions", user?.id] });
  };

  const getSessionStats = (session) => {
    const sessionTrades = trades.filter(t => t.replay_session_id === session.id);
    return { trades: sessionTrades, stats: computeStats(sessionTrades) };
  };

  const activeSessions = sessions.filter(s => s.status !== "completed");
  const completedSessions = sessions.filter(s => s.status === "completed");

  const renderSessionSection = (sessionList, icon, label) => {
    if (!sessionList.length) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          {icon} {label}
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {sessionList.map(session => {
            const { trades: st, stats } = getSessionStats(session);
            return (
              <div key={session.id} className="relative">
                <SessionCard
                  session={session}
                  tradeCount={st.length}
                  stats={stats}
                  onClick={() => navigate(`/backtest/replay?session=${session.id}`)}
                  selectionMode={selectMode}
                  isSelected={selectedIds.has(session.id)}
                  onSelect={() => toggleSelect(session.id)}
                />
                {!selectMode && (
                  <button
                    onClick={(e) => handleDeleteSingle(session.id, e)}
                    className="absolute bottom-3 right-3 w-7 h-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20"
                    title="Delete session"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Replay Hub</h1>
          <p className="text-sm text-muted-foreground">
            Practice, test and refine your edge.
          </p>
        </div>
        {sessions.length > 0 && (
          <button
            onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors",
              selectMode
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border/60 text-muted-foreground hover:text-foreground"
            )}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            {selectMode ? "Done" : "Select"}
          </button>
        )}
      </div>

      {/* Quick Replay */}
      <div className="bg-card border border-border/60 rounded-2xl p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center flex-shrink-0">
          <Zap className="w-6 h-6 text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold">Quick Replay</h2>
          <p className="text-sm text-muted-foreground">
            Jump straight into replay. No session required.
          </p>
        </div>
        <button
          onClick={handleQuickReplay}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-warning text-black text-sm font-semibold hover:bg-warning/90 transition-colors flex-shrink-0"
        >
          Start Replay <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Research Sessions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" />
            <h2 className="font-bold">Research Sessions</h2>
          </div>
          {!selectMode && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold border border-primary/20 hover:bg-primary/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Session
            </button>
          )}
        </div>

        {/* Batch action bar */}
        {selectMode && selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl">
            <span className="text-sm font-semibold text-primary">{selectedIds.size} selected</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={handleBatchComplete}
                disabled={!!batchAction}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 text-success border border-success/20 text-xs font-semibold hover:bg-success/20 transition-colors disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark Completed
              </button>
              <button
                onClick={handleBatchReopen}
                disabled={!!batchAction}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground border border-border/60 text-xs font-semibold hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reopen
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={!!batchAction}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-xs font-semibold hover:bg-destructive/20 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
              <button
                onClick={clearSelection}
                className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Select all bar */}
        {selectMode && sessions.length > 0 && (
          <button
            onClick={selectedIds.size === sessions.length ? clearSelection : selectAll}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {selectedIds.size === sessions.length
              ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
              : <Square className="w-3.5 h-3.5" />}
            {selectedIds.size === sessions.length ? "Deselect All" : "Select All"}
          </button>
        )}

        {/* New Session Form */}
        {showForm && (
          <SessionCreateForm
            onCreate={handleCreateSession}
            onCancel={() => setShowForm(false)}
            creating={creating}
          />
        )}

        {/* Active Sessions */}
        {renderSessionSection(activeSessions, <Clock className="w-3 h-3" />, "Active")}

        {/* Completed Sessions */}
        {renderSessionSection(completedSessions, <CheckCircle2 className="w-3 h-3" />, "Completed")}

        {/* Empty state */}
        {sessions.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center h-48 text-center bg-card border border-border/60 rounded-2xl">
            <FlaskConical className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <h3 className="font-semibold">No research sessions yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Create a research session to start structured backtesting with trackable results.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}