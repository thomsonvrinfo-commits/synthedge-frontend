/**
 * AccessGate — Wraps premium features.
 * Shows an upgrade wall when subscriptionStatus is EXPIRED.
 * Renders children normally during TRIAL or ACTIVE.
 */
import React from "react";
import { Link } from "react-router-dom";
import { Lock, Crown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/useSubscription";

export default function AccessGate({ children, feature = "This feature" }) {
  const { hasFullAccess, isExpired, isTrial, trialDaysLeft, isLoading } = useSubscription();

  if (isLoading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (hasFullAccess) {
    return (
      <>
        {/* Trial warning banner — show when ≤ 3 days left */}
        {isTrial && trialDaysLeft <= 3 && (
          <div className="mb-4 flex items-center gap-3 p-3 rounded-xl bg-warning/10 border border-warning/20 text-xs font-medium text-warning">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>
              Your free trial ends in <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""}</strong>.{" "}
              <Link to="/upgrade" className="underline">Upgrade now</Link> to keep full access.
            </span>
          </div>
        )}
        {children}
      </>
    );
  }

  // Expired / locked state
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mb-4">
        <Lock className="w-7 h-7 text-warning" />
      </div>
      <h3 className="text-lg font-bold">{feature} is locked</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        Your trial has ended. Upgrade to <strong>Disciplined Trader</strong> to continue using premium features.
      </p>
      <Link
        to="/pricing"
        className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        <Crown className="w-4 h-4" /> View Plans
      </Link>
      <p className="text-xs text-muted-foreground mt-3">
        You can still <Link to="/" className="underline">view your dashboard</Link> and historical data.
      </p>
    </div>
  );
}