import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listConnections,
  connectDeriv as apiConnectDeriv,
  connectMt5 as apiConnectMt5,
  disconnectBroker,
} from "@/api/broker";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Loader2, Link2, AlertTriangle } from "lucide-react";

export default function ConnectedAccounts() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [showDeriv, setShowDeriv] = useState(false);
  const [showMt5, setShowMt5] = useState(false);
  const [derivToken, setDerivToken] = useState("");
  const [mt5, setMt5] = useState({ login: "", server: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const { data: connections = [] } = useQuery({
    queryKey: ["brokerConnections", user?.id],
    queryFn: () => listConnections(),
    enabled: !!user?.id,
    initialData: [],
  });

  const reload = () => queryClient.invalidateQueries({ queryKey: ["brokerConnections", user?.id] });

  const connectDeriv = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await apiConnectDeriv(derivToken);
      setDerivToken(""); setShowDeriv(false); reload();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally { setBusy(false); }
  };

  const connectMt5 = async () => {
    setBusy(true); setErr(null);
    try {
      await apiConnectMt5(mt5);
      setMt5({ login: "", server: "", password: "" }); setShowMt5(false); reload();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally { setBusy(false); }
  };

  const disconnect = async (id) => {
    if (!confirm("Disconnect this account? Synced trades are kept.")) return;
    setBusy(true);
    try {
      await disconnectBroker(id);
      reload();
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally { setBusy(false); }
  };

  const statusBadge = (s) => (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
      s === "connected" ? "bg-success/15 text-success" : s === "error" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}>
      {s}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="w-5 h-5 text-primary" />
        <h2 className="font-bold">Connected Accounts</h2>
      </div>

      {connections.length > 0 && (
        <div className="space-y-2">
          {connections.map(c => (
            <div key={c.id} className="flex items-center gap-3 p-3 bg-card border border-border/60 rounded-xl">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary">{c.broker === "deriv" ? "D" : "M"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{c.display_name || c.account_id}</p>
                <p className="text-xs text-muted-foreground">
                  {c.broker === "deriv" ? "Deriv" : "MT5/Exness"} · {c.account_type}
                  {c.last_error && <span className="text-destructive"> · {c.last_error}</span>}
                </p>
              </div>
              {statusBadge(c.status)}
              <button
                onClick={() => disconnect(c.id)}
                disabled={busy}
                className="w-8 h-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {err && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />{err}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowDeriv(p => !p)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold border border-primary/20 hover:bg-primary/20"
        >
          <Plus className="w-3.5 h-3.5" /> Connect Deriv
        </button>
        <button
          onClick={() => setShowMt5(p => !p)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border/60 text-xs font-semibold hover:bg-accent"
        >
          <Plus className="w-3.5 h-3.5" /> Connect MT5/Exness
        </button>
      </div>

      {showDeriv && (
        <div className="space-y-2 p-4 bg-card border border-border/60 rounded-xl">
          <p className="text-xs text-muted-foreground">
            Enter your Deriv API token (read-only is enough). It is encrypted at rest and never exposed client-side.
          </p>
          <input
            type="password"
            value={derivToken}
            onChange={e => setDerivToken(e.target.value)}
            placeholder="Deriv API token"
            className="w-full h-9 bg-background border border-border/60 rounded-lg px-3 text-sm"
          />
          <button
            onClick={connectDeriv}
            disabled={busy || !derivToken}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Connect
          </button>
        </div>
      )}

      {showMt5 && (
        <div className="space-y-2 p-4 bg-card border border-border/60 rounded-xl">
          <p className="text-xs text-muted-foreground">
            Credentials are sent securely to MetaAPI and never stored in the database.
          </p>
          <input
            value={mt5.login}
            onChange={e => setMt5({ ...mt5, login: e.target.value })}
            placeholder="MT5 login"
            className="w-full h-9 bg-background border border-border/60 rounded-lg px-3 text-sm"
          />
          <input
            value={mt5.server}
            onChange={e => setMt5({ ...mt5, server: e.target.value })}
            placeholder="Server (e.g. Exness-Server)"
            className="w-full h-9 bg-background border border-border/60 rounded-lg px-3 text-sm"
          />
          <input
            type="password"
            value={mt5.password}
            onChange={e => setMt5({ ...mt5, password: e.target.value })}
            placeholder="Investor password"
            className="w-full h-9 bg-background border border-border/60 rounded-lg px-3 text-sm"
          />
          <button
            onClick={connectMt5}
            disabled={busy || !mt5.login || !mt5.server || !mt5.password}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Connect
          </button>
        </div>
      )}

      {connections.length === 0 && !showDeriv && !showMt5 && (
        <p className="text-xs text-muted-foreground">No broker accounts connected yet.</p>
      )}
    </div>
  );
}