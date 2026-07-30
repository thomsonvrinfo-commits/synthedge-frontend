import React, { useState } from "react";
import { updateTrade } from "@/api/trades";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

const EMOTIONS = [
  { key: "Calm",       emoji: "😌", label: "Calm" },
  { key: "Confident",  emoji: "😊", label: "Focused" },
  { key: "Neutral",    emoji: "😐", label: "Neutral" },
  { key: "Anxious",    emoji: "😟", label: "Anxious" },
  { key: "Frustrated", emoji: "😡", label: "Frustrated" },
];

const PLAN_OPTIONS = [
  { key: "Fully",     emoji: "✅", label: "Fully" },
  { key: "Partially", emoji: "⚠️", label: "Partially" },
  { key: "No",        emoji: "❌", label: "No" },
];

export default function QuickReflection({ trade, onDone }) {
  const [emotion, setEmotion] = useState(null);
  const [planFollowed, setPlanFollowed] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleDone = async () => {
    setSaving(true);
    await updateTrade(trade.id, {
      emotional_state: emotion || undefined,
      plan_followed: planFollowed || undefined,
      reflection_completed: true,
    });
    setSaving(false);
    onDone();
  };

  const handleSkip = async () => {
    await updateTrade(trade.id, {
      reflection_completed: false,
    });
    onDone();
  };

  return (
    <div className="space-y-6 py-2">
      {/* Saved indicator */}
      <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <p className="text-sm font-semibold text-emerald-400">Trade saved! Quick reflection (3 sec)</p>
      </div>

      {/* Q1: Emotion */}
      <div className="space-y-3">
        <p className="text-sm font-bold">How did you feel?</p>
        <div className="flex gap-2 flex-wrap">
          {EMOTIONS.map(e => (
            <button
              key={e.key}
              onClick={() => setEmotion(emotion === e.key ? null : e.key)}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all min-w-[60px]",
                emotion === e.key
                  ? "bg-primary/15 border-primary text-primary"
                  : "bg-secondary border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <span className="text-xl">{e.emoji}</span>
              <span>{e.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Q2: Plan followed */}
      <div className="space-y-3">
        <p className="text-sm font-bold">Did you follow your plan?</p>
        <div className="flex gap-2">
          {PLAN_OPTIONS.map(p => (
            <button
              key={p.key}
              onClick={() => setPlanFollowed(planFollowed === p.key ? null : p.key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all",
                planFollowed === p.key
                  ? "bg-primary/15 border-primary text-primary"
                  : "bg-secondary border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <span>{p.emoji}</span>
              <span className="text-xs">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSkip}
          className="flex-1 py-2.5 rounded-xl border border-border/60 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          Skip for now
        </button>
        <button
          onClick={handleDone}
          disabled={saving}
          className="flex-[2] py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {saving ? "Saving…" : "Done ✓"}
        </button>
      </div>
    </div>
  );
}