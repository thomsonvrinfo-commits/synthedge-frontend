import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

const MINDSET_QUOTES = [
  "A good trade can still lose. Process over outcome.",
  "Patience is part of the strategy.",
  "Protect your mindset before protecting profits.",
  "The best traders don't predict — they react.",
  "Discipline is doing the right thing even when it feels wrong.",
  "One bad trade doesn't define you. Quitting does.",
  "Your edge compounds only when your behavior does.",
  "No setup is worth breaking your rules for.",
  "Size down when uncertain. Survive to trade another day.",
  "Consistency is more valuable than a big win.",
  "The market will always give you another opportunity.",
  "Fear of missing out creates the losses you feared.",
  "Your stop loss is not a failure — it's your plan working.",
  "Trade the chart, not your emotions.",
  "Small wins, repeated, build a trading career.",
  "Revenge trading turns a small loss into a big one.",
  "The session you don't trade is sometimes your best session.",
  "Execute your process. Let the market handle the outcome.",
  "You can control entries and exits. You cannot control results.",
  "Stillness is a trader's most underrated skill.",
];

export default function MindsetCard({ className, compact = false }) {
  const quote = useMemo(() => {
    const day = new Date().getDate();
    return MINDSET_QUOTES[day % MINDSET_QUOTES.length];
  }, []);

  if (compact) {
    return (
      <div className={cn("flex items-start gap-2.5 p-3 bg-primary/5 border border-primary/15 rounded-xl", className)}>
        <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground italic leading-relaxed">"{quote}"</p>
      </div>
    );
  }

  return (
    <div className={cn("bg-card border border-border rounded-xl p-5", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Daily Mindset</p>
      </div>
      <p className="text-sm text-foreground leading-relaxed italic">"{quote}"</p>
    </div>
  );
}