import React, { useState } from "react";
import { Sparkles, X, Send, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const QUICK_QUESTIONS = [
  "Why did I lose yesterday?",
  "What is my best setup?",
  "What habits hurt my performance?",
  "How can I improve next week?",
];

export default function AICoachButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}

      {/* Popup */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-72 bg-card border border-border/80 rounded-2xl shadow-2xl p-4 space-y-3 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">SynthEdge AI Coach</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Ask me anything about your trading performance.</p>
          <div className="space-y-1.5">
            {QUICK_QUESTIONS.map((q) => (
              <Link
                key={q}
                to={`/coach?q=${encodeURIComponent(q)}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 w-full p-2 rounded-xl bg-secondary/50 hover:bg-primary/10 hover:text-primary text-xs text-left transition-colors group"
              >
                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground group-hover:text-primary" />
                {q}
              </Link>
            ))}
          </div>
          <Link to="/coach">
            <button className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
              <Send className="w-3.5 h-3.5" /> Open Full AI Coach
            </button>
          </Link>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-2xl shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 font-semibold text-sm"
      >
        <Sparkles className="w-4 h-4" />
        Ask SynthEdge AI
      </button>
    </>
  );
}