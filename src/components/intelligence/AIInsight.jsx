import React from "react";
import { Sparkles } from "lucide-react";

export default function AIInsight({ text }) {
  return (
    <div className="flex items-start gap-2 mt-3 p-2.5 rounded-xl bg-primary/8 border border-primary/20">
      <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
      <p className="text-[11px] text-foreground leading-relaxed">{text}</p>
    </div>
  );
}