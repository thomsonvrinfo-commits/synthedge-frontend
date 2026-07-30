import React, { useState, useEffect } from "react";
import { updateBrokerTrade } from "@/api/broker";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

export default function BrokerTradeDetail({ trade, open, onClose }) {
  const queryClient = useQueryClient();
  const [emotionTag, setEmotionTag] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (trade) {
      setEmotionTag(trade.emotion_tag || "");
      setNote(trade.note || "");
    }
  }, [trade]);

  if (!open || !trade) return null;

  const save = async () => {
    setSaving(true);
    try {
      await updateBrokerTrade(trade.id, { emotion_tag: emotionTag, note });
      queryClient.invalidateQueries({ queryKey: ["brokerTrades"] });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const Row = ({ label, value }) => (
    <div className="flex justify-between py-1.5 border-b border-border/40">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-card border border-border/60 rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">
              {trade.broker === "deriv" ? "Deriv" : "MT5/Exness"} · {trade.account_id}
            </p>
            <h3 className="text-lg font-bold">{trade.symbol}</h3>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div>
          <Row label="Side" value={trade.side.toUpperCase()} />
          <Row label="Volume" value={trade.volume} />
          <Row label="Entry" value={trade.entry_price} />
          <Row label="Exit" value={trade.exit_price} />
          <Row label="Opened" value={trade.opened_at ? new Date(trade.opened_at).toLocaleString() : "—"} />
          <Row label="Closed" value={trade.closed_at ? new Date(trade.closed_at).toLocaleString() : "—"} />
          <Row label="Duration" value={trade.duration_seconds != null ? Math.round(trade.duration_seconds) + "s" : "—"} />
          <Row label="P/L" value={(Number(trade.pnl) >= 0 ? "+" : "") + Number(trade.pnl).toFixed(2) + " " + (trade.currency || "USD")} />
          <Row label="Fees / Swap" value={Number(trade.fees || 0).toFixed(2) + " / " + Number(trade.swap || 0).toFixed(2)} />
          <Row label="Result" value={trade.result.toUpperCase()} />
          {trade.r_multiple != null && <Row label="R Multiple" value={trade.r_multiple} />}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">Emotion Tag</label>
          <input
            value={emotionTag}
            onChange={e => setEmotionTag(e.target.value)}
            placeholder="e.g. calm, FOMO, revenge"
            className="w-full h-9 bg-background border border-border/60 rounded-lg px-3 text-sm"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">Note</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="Reflections on this trade..."
            className="w-full bg-background border border-border/60 rounded-lg p-3 text-sm"
          />
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Notes"}
        </button>
      </div>
    </div>
  );
}