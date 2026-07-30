/**
 * TrialBanner — Shows trial countdown or expired-trial notice.
 */
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Rocket, Clock, X } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

export default function TrialBanner() {
  const { isTrial, isExpired, trialDaysLeft, isLoading, isAdmin, isDeveloper } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || dismissed || isAdmin || isDeveloper) return null;

  // Active trial banner
  if (isTrial) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 border-b border-primary/20 text-xs text-primary">
        <Rocket className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1">
          <strong>🚀 Disciplined Trader Trial</strong> —{" "}
          <strong>{trialDaysLeft}</strong> day{trialDaysLeft !== 1 ? "s" : ""} remaining.{" "}
          <Link to="/pricing" className="underline font-semibold">Upgrade now</Link>
        </span>
        <button onClick={() => setDismissed(true)} className="p-0.5 hover:opacity-60 transition-opacity">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Expired trial banner
  if (isExpired) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 bg-muted border-b border-border text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5 flex-shrink-0 text-warning" />
        <span className="flex-1">
          <strong className="text-foreground">Free Plan Active</strong> — Your 7-day Disciplined Trader trial has ended.
          Your journal and trade history remain available.{" "}
          <Link to="/pricing" className="underline font-semibold text-primary">Upgrade to unlock premium features →</Link>
        </span>
        <button onClick={() => setDismissed(true)} className="p-0.5 hover:opacity-60 transition-opacity">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return null;
}