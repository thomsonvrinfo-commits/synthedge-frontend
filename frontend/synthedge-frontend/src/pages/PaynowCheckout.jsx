/**
 * PaynowCheckout — Gets signed fields from the backend, initiates via Cloudflare Worker,
 * then redirects to Paynow browserurl. After return, polls until webhook activation completes.
 */
import React, { useState, useEffect, useRef } from "react";
import { createPaymentRecord } from "@/api/subscription";
import { pollPaynow } from "@/api/billing";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Crown, Loader2, CheckCircle2, AlertTriangle, CreditCard, ExternalLink, Zap, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";

const PAYNOW_WORKER_URL = "https://synthedge-paynow.thomsonvr-info.workers.dev/";
const CONFIRM_POLL_MS = 2000;
const CONFIRM_MAX_ATTEMPTS = 20;

export default function PaynowCheckout() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const returnStatus = searchParams.get("status");
  const planParam = searchParams.get("plan") || "monthly";
  const isAnnual = planParam === "annual";
  const isReturnSuccess = returnStatus === "success";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmTimedOut, setConfirmTimedOut] = useState(false);
  const pollAttempts = useRef(0);

  const { isActive, isLoading: subLoading } = useSubscription();

useEffect(() => {
  if (!isReturnSuccess || isActive) {
    pollAttempts.current = 0;
    setConfirmTimedOut(false);
    return;
  }

  const reference = searchParams.get("reference");

  const intervalId = setInterval(async () => {
    pollAttempts.current += 1;

    // Every 3rd attempt, call pollPaynow to actively check with Paynow
    if (reference && pollAttempts.current % 3 === 0) {
      try {
        await pollPaynow(reference);
      } catch (e) {
        console.warn("pollPaynow invoke failed:", e);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["traderProfileSub"] });

    if (pollAttempts.current >= CONFIRM_MAX_ATTEMPTS) {
      clearInterval(intervalId);
      setConfirmTimedOut(true);
    }
  }, CONFIRM_POLL_MS);

  return () => clearInterval(intervalId);
}, [isReturnSuccess, isActive, queryClient, searchParams]);
const handlePaynow = async () => {
  setLoading(true);
  setError(null);

  try {
    const amount = isAnnual ? 99 : 10;
    const billingCycle = isAnnual ? "annual" : "monthly";

    // Create the pending payment record first.
    const paymentRecord = await createPaymentRecord({
      amount,
      method: "paynow",
      billingCycle,
    });

    if (!paymentRecord?.id) {
      throw new Error("Payment record was not created.");
    }

    // Pass the payment record ID to the Paynow Worker.
    const response = await fetch(PAYNOW_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "initiate",
        plan: planParam,
        paymentRecordId: paymentRecord.id,
      }),
    });

    const payload = await response.json();

    if (!response.ok || payload?.error) {
      throw new Error(payload?.error || "Could not start Paynow checkout.");
    }

    if (payload?.browserurl) {
      window.location.href = payload.browserurl;
      return;
    }

    throw new Error("Could not start Paynow checkout.");
  } catch (err) {
    console.error("Checkout error:", err);
    setError(err?.message || "Payment unavailable. Please try again shortly.");
    setLoading(false);
  }
};

  if (isActive) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-success" />
        </div>
        <h2 className="text-xl font-bold">Payment received!</h2>
        <p className="text-sm text-muted-foreground">
          Your <strong>Disciplined Trader</strong> subscription is now active.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  if (isReturnSuccess && !confirmTimedOut) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
        <h2 className="text-xl font-bold">Confirming your payment…</h2>
        <p className="text-sm text-muted-foreground">
          Paynow has received your payment. We are activating your subscription — this usually takes a few seconds.
        </p>
      </div>
    );
  }

  if (isReturnSuccess && confirmTimedOut) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8 text-warning" />
        </div>
        <h2 className="text-xl font-bold">Payment received — activation pending</h2>
        <p className="text-sm text-muted-foreground">
          Your payment was successful. Subscription activation is taking longer than expected. Please refresh in a minute or contact support if access is not unlocked.
        </p>
        <Button onClick={() => window.location.reload()} variant="outline">
          Refresh status
        </Button>
      </div>
    );
  }

  if (returnStatus === "cancelled") {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-warning" />
        </div>
        <h2 className="text-xl font-bold">Payment cancelled</h2>
        <p className="text-sm text-muted-foreground">Your payment was not completed. No charge was made.</p>
        <Button onClick={() => window.location.reload()} variant="outline">Try Again</Button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-12 space-y-6">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Crown className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Disciplined Trader</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAnnual ? "$99/year · Save 18% · 7-day free trial included" : "$10/month · 7-day free trial included"}
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold">What's included</h3>
        {[
          "Unlimited journal trades",
          "Full replay history (1000+ candles)",
          "All drawing tools",
          "AI trading intelligence",
          "Advanced analytics & session insights",
          "Priority support",
        ].map((f) => (
          <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
            {f}
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <CreditCard className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">Pay with Paynow</p>
            <p className="text-xs text-muted-foreground">EcoCash · Visa · Mastercard · ZimSwitch</p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <Button
          className={isAnnual ? "w-full gap-2 bg-warning text-black hover:bg-warning/90" : "w-full gap-2"}
          onClick={handlePaynow}
          disabled={loading || subLoading}
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to Paynow…</>
          ) : isAnnual ? (
            <><Zap className="w-4 h-4" /> Pay $99/year with Paynow</>
          ) : (
            <><ExternalLink className="w-4 h-4" /> Pay $10/month with Paynow</>
          )}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center">
          You'll be redirected to Paynow's secure checkout. Your subscription activates automatically after payment confirmation.
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <Link to="/pricing" className="underline">View all plans</Link> · Secure payment via Paynow Zimbabwe
      </p>
    </div>
  );
}
