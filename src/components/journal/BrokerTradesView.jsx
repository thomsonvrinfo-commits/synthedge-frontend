import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listConnections, listBrokerTrades } from "@/api/broker";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw, Radio } from "lucide-react";
import BrokerTradeDetail from "./BrokerTradeDetail";

function brokerBadge(broker) {
  return broker === "deriv" ? "Deriv" : "MT5/Exness";
}
function timeAgo(iso) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

export default function BrokerTradesView() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);

  const { data: connections = [] } = useQuery({
    queryKey: ["brokerConnections", user?.id],
    queryFn: () => listConnections(),
    enabled: !!user?.id,
    initialData: [],
  });
  const { data: trades = [], isLoading } = useQuery({
    queryKey: ["brokerTrades", user?.id],
    queryFn: () => listBrokerTrades({ accountType: "live", limit: 500 }),
    enabled: !!user?.id,
    initialData: [],
  });

  const errorConns = connections.filter(c => c.status === "error");
  const lastSync = connections.map(c => c.last_synced_at).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["brokerTrades", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["brokerConnections", user?.id] });
  };

  return (
    <div className="space-y-3">
      {errorConns.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            {errorConns.length} account{errorConns.length !== 1 ? "s" : ""} failed to sync ({errorConns.map(c => c.display_name || c.account_id).join(", ")}).{" "}
            <button onClick={refresh} className="underline">Retry</button>
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {connections.length ? `Last synced ${timeAgo(lastSync)}` : "No connected accounts yet"}
        </p>
        <button onClick={refresh} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !connections.length ? (
        <div className="flex flex-col items-center justify-center h-48 text-center bg-card border border-border/60 rounded-2xl">
          <Radio className="w-8 h-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground max-w-xs">Connect a broker account in Settings to auto-import your trades.</p>
        </div>
      ) : !trades.length ? (
        <div className="flex flex-col items-center justify-center h-48 text-center bg-card border border-border/60 rounded-2xl">
          <p className="text-sm text-muted-foreground">Your next trade will appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trades.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className="w-full flex items-center gap-3 p-3 bg-card border border-border/60 rounded-xl hover:bg-accent/40 transition-colors text-left"
            >
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0", t.broker === "deriv" ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning")}>
                {brokerBadge(t.broker)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{t.symbol}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {t.side.toUpperCase()} · {t.volume} · {new Date(t.closed_at || t.opened_at).toLocaleString()}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={cn("text-sm font-bold", t.result === "win" ? "text-success" : t.result === "loss" ? "text-destructive" : "text-muted-foreground")}>
                  {t.result.toUpperCase()}
                </p>
                <p className={cn("text-xs font-mono", Number(t.pnl) >= 0 ? "text-success" : "text-destructive")}>
                  {Number(t.pnl) >= 0 ? "+" : ""}{Number(t.pnl).toFixed(2)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <BrokerTradeDetail trade={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}