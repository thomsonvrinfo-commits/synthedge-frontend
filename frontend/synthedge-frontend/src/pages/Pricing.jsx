import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, X, Crown, Shield, RefreshCw, Database, Headphones, Star, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/useSubscription";

const SHOW_FOUNDING_BANNER = true; // feature flag

const FREE_FEATURES_INCLUDED = [
  "50 LIVE trades (lifetime)",
  "Journal access",
  "Basic Dashboard",
  "Basic Calendar",
  "Equity Curve",
  "Best Session",
  "Replay up to 1000 candles",
  "Maximum 3 replay sessions/day",
];
const FREE_FEATURES_LOCKED = [
  "AI Intelligence",
  "Trading DNA",
  "Emotional Analytics",
  "Advanced Analytics",
  "Unlimited Replay",
  "Export Features",
  "Unlimited BACKTEST",
];

const PRO_FEATURES = [
  "Unlimited LIVE trades",
  "Unlimited BACKTEST trades",
  "Unlimited Replay",
  "Unlimited candles",
  "AI Intelligence & Coach",
  "Trading DNA",
  "Emotional Analytics",
  "Expectancy & Profit Factor",
  "Discipline Score",
  "Advanced Calendar",
  "Export Features",
  "Future Premium Features",
];

const TRUST_ITEMS = [
  { icon: Shield, title: "Secure & Private", desc: "Your trading data is encrypted and never shared." },
  { icon: RefreshCw, title: "Cancel Anytime", desc: "Manage your subscription anytime." },
  { icon: Database, title: "Data Stays Yours", desc: "Your historical trading data always remains yours." },
  { icon: Headphones, title: "Priority Support", desc: "Disciplined Trader members receive priority support." },
];

function FeatureItem({ text, included }) {
  return (
    <div className={cn("flex items-start gap-2.5 text-sm", included ? "text-foreground" : "text-muted-foreground/50")}>
      {included
        ? <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
        : <X className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-40" />
      }
      <span>{text}</span>
    </div>
  );
}

export default function Pricing() {
  const navigate = useNavigate();
  const { hasFullAccess, isActive, isTrial, isDeveloper, isAdmin, plan } = useSubscription();

  const handleMonthly = () => navigate("/checkout/paynow?plan=monthly");
  const handleAnnual = () => navigate("/checkout/paynow?plan=annual");

  const currentPlanLabel = () => {
    if (isDeveloper) return "Developer";
    if (isAdmin) return "Admin";
    if (isTrial) return "Trial Active";
    if (isActive) return plan?.includes("ANNUAL") ? "Annual" : "Monthly";
    return null;
  };
  const activePlanLabel = currentPlanLabel();

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-16">
      {/* Header */}
      <div className="text-center space-y-3 pt-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary mb-2">
          <Crown className="w-3.5 h-3.5" /> PRICING
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight">
          Choose Your Path to{" "}
          <span className="text-primary">Consistency</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          Powerful tools for every stage of your trading journey.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
        {/* FREE */}
        <div className="bg-card border border-border/60 rounded-2xl p-6 space-y-5 flex flex-col">
          <div>
            <div className="inline-block px-3 py-1 bg-secondary text-xs font-bold rounded-lg mb-3 text-muted-foreground">FREE</div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Free</p>
            <p className="text-4xl font-black mt-1">
              $0 <span className="text-base font-normal text-muted-foreground">/ forever</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1.5">For traders beginning their journey.</p>
          </div>

          <div className="space-y-2.5 flex-1">
            {FREE_FEATURES_INCLUDED.map(f => <FeatureItem key={f} text={f} included />)}
            <div className="border-t border-border/40 pt-2.5 mt-2.5 space-y-2.5">
              {FREE_FEATURES_LOCKED.map(f => <FeatureItem key={f} text={f} included={false} />)}
            </div>
          </div>

          <Link
            to="/"
            className="block w-full py-3 rounded-xl border border-border/60 text-center text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
          >
            Get Started Free
          </Link>
        </div>

        {/* MONTHLY — highlighted */}
        <div className="relative bg-card border-2 border-primary rounded-2xl p-6 space-y-5 flex flex-col shadow-lg shadow-primary/10">
          {/* Badge */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-1.5 px-4 py-1.5 bg-primary rounded-full text-xs font-bold text-primary-foreground whitespace-nowrap">
              <Star className="w-3 h-3" /> MOST POPULAR
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-primary uppercase tracking-wider">DISCIPLINED TRADER</p>
            <p className="text-4xl font-black mt-1">
              $10 <span className="text-base font-normal text-muted-foreground">/ month</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1.5">For traders serious about consistency.</p>
          </div>

          <div className="space-y-2.5 flex-1">
            {PRO_FEATURES.map(f => <FeatureItem key={f} text={f} included />)}
          </div>

          <div className="space-y-2">
            {(isActive && !isTrial) || isAdmin || isDeveloper ? (
              <div className="w-full py-3 rounded-xl bg-success/10 border border-success/20 text-center text-sm font-semibold text-success">
                ✓ {activePlanLabel}
              </div>
            ) : (
              <>
                <button
                  onClick={handleMonthly}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
                >
                  {isTrial ? "Upgrade Now — $10/month" : "Start 7-Day Free Trial"}
                </button>
                {isTrial && (
                  <p className="text-[11px] text-warning text-center font-medium">You're on trial — upgrade now to keep access.</p>
                )}
              </>
            )}
            {!isTrial && <p className="text-[11px] text-muted-foreground text-center">Cancel anytime. No commitment.</p>}
          </div>
        </div>

        {/* ANNUAL */}
        <div className="relative bg-card border border-warning/40 rounded-2xl p-6 space-y-5 flex flex-col">
          {/* Badge */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-1.5 px-4 py-1.5 bg-warning rounded-full text-xs font-bold text-black whitespace-nowrap">
              <Crown className="w-3 h-3" /> BEST VALUE
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-warning uppercase tracking-wider">DISCIPLINED TRADER</p>
            <p className="text-4xl font-black mt-1">
              $99 <span className="text-base font-normal text-muted-foreground">/ year</span>
            </p>
            <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-lg bg-warning/15 border border-warning/30">
              <Zap className="w-3 h-3 text-warning" />
              <span className="text-xs font-bold text-warning">Save 18% (2 months free)</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1.5">Commit to your growth and save more.</p>
          </div>

          <div className="space-y-2.5 flex-1">
            {PRO_FEATURES.map(f => <FeatureItem key={f} text={f} included />)}
          </div>

          <div className="space-y-2">
            {(isActive && !isTrial) || isAdmin || isDeveloper ? (
              <div className="w-full py-3 rounded-xl bg-success/10 border border-success/20 text-center text-sm font-semibold text-success">
                ✓ {activePlanLabel}
              </div>
            ) : (
              <button
                onClick={handleAnnual}
                className="w-full py-3 rounded-xl bg-warning text-black text-sm font-bold hover:bg-warning/90 transition-colors"
              >
                {isTrial ? "Upgrade Now — $99/year" : "Start 7-Day Free Trial"}
              </button>
            )}
            <p className="text-[11px] text-muted-foreground text-center">Cancel anytime. No commitment.</p>
          </div>
        </div>
      </div>

      {/* Trust Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {TRUST_ITEMS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex flex-col items-center text-center gap-2 p-4 bg-card border border-border/60 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <p className="text-sm font-semibold text-primary">{title}</p>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>
        ))}
      </div>

      {/* Founding Member Banner */}
      {SHOW_FOUNDING_BANNER && (
        <div className="flex items-center justify-center gap-3 py-4 border-t border-border/40">
          <Star className="w-4 h-4 text-primary" />
          <p className="text-sm text-muted-foreground text-center">
            <span className="text-foreground font-semibold">Founding Price Protection:</span>{" "}
            Lock in your price forever.
          </p>
        </div>
      )}
    </div>
  );
}