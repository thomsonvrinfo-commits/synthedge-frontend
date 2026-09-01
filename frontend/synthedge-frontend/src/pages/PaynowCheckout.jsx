/**
 * PaynowCheckout
 *
 * Creates a pending SynthEdge payment record, starts Paynow checkout,
 * stores the Paynow poll URL locally, and verifies the payment after return.
 *
 * Subscription activation is performed by the Paynow webhook -> Entities
 * Worker flow. Frontend polling is only used to show the current payment
 * state while webhook activation is being completed.
 */

import React, { useState, useEffect, useRef } from "react";
import { pollPaynow } from "@/api/billing";
import { createPaymentRecord } from "@/api/subscription";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Crown,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  ExternalLink,
  Zap,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";

const PAYNOW_WORKER_URL =
  "https://synthedge-paynow.thomsonvr-info.workers.dev";

const CONFIRM_POLL_MS = 2000;
const CONFIRM_MAX_ATTEMPTS = 20;

const POLL_STORAGE_KEY = "synthedge_paynow_poll";

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
  const [paymentStatus, setPaymentStatus] = useState(null);

  const pollAttempts = useRef(0);

  const { isActive, isLoading: subLoading } = useSubscription();

  useEffect(() => {
    if (!isReturnSuccess || isActive) {
      pollAttempts.current = 0;
      setConfirmTimedOut(false);
      return;
    }

    const stored = sessionStorage.getItem(POLL_STORAGE_KEY);

    if (!stored) {
      setConfirmTimedOut(true);
      return;
    }

    let pollData;

    try {
      pollData = JSON.parse(stored);
    } catch {
      sessionStorage.removeItem(POLL_STORAGE_KEY);
      setConfirmTimedOut(true);
      return;
    }

    const pollUrl = pollData?.pollUrl;

    if (!pollUrl) {
      setConfirmTimedOut(true);
      return;
    }

    const intervalId = setInterval(async () => {
      pollAttempts.current += 1;

      // Check Paynow directly every third attempt.
      if (pollAttempts.current % 3 === 0) {
        try {
          const result = await pollPaynow(pollUrl);

          const status = result?.status || null;
          setPaymentStatus(status);

          const normalizedStatus = String(status || "").toLowerCase();

          // These statuses are terminal and should not be treated as
          // successful subscription activation.
          if (
            normalizedStatus === "cancelled" ||
            normalizedStatus === "failed" ||
            normalizedStatus === "declined" ||
            normalizedStatus === "error"
          ) {
            clearInterval(intervalId);
            sessionStorage.removeItem(POLL_STORAGE_KEY);
            setError("Payment was not completed.");
            setConfirmTimedOut(false);
            return;
          }
        } catch (e) {
          console.warn("Paynow polling failed:", e);
        }
      }

      // The webhook activates the subscription. Refresh subscription state.
      await queryClient.invalidateQueries({
        queryKey: ["traderProfileSub"],
      });

      if (pollAttempts.current >= CONFIRM_MAX_ATTEMPTS) {
        clearInterval(intervalId);
        sessionStorage.removeItem(POLL_STORAGE_KEY);
        setConfirmTimedOut(true);
      }
    }, CONFIRM_POLL_MS);

    return () => clearInterval(intervalId);
  }, [isReturnSuccess, isActive, queryClient]);

  const handlePaynow = async () => {
    setLoading(true);
    setError(null);

    try {
      const amount = isAnnual ? 99 : 10;
      const billingCycle = isAnnual ? "annual" : "monthly";

      // 1. Create the pending payment record first.
      const paymentRecord = await createPaymentRecord({
        amount,
        method: "paynow",
        billingCycle,
      });

      if (!paymentRecord?.id) {
        throw new Error("Payment record was not created.");
      }

      // 2. Initiate Paynow using that payment record ID.
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
        throw new Error(
          payload?.error || "Could not start Paynow checkout."
        );
      }

      if (!payload?.browserurl) {
        throw new Error("Paynow did not return a checkout URL.");
      }

      // 3. Keep the poll URL locally so it survives the Paynow redirect.
      if (payload?.pollurl) {
        sessionStorage.setItem(
          POLL_STORAGE_KEY,
          JSON.stringify({
            paymentRecordId: paymentRecord.id,
            reference: payload.reference,
            pollUrl: payload.pollurl,
          })
        );
      }

      // 4. Redirect user to Paynow.
      window.location.href = payload.browserurl;
    } catch (err) {
      console.error("Checkout error:", err);
      setError(
        err?.message || "Payment unavailable. Please try again shortly."
      );
      setLoading(false);
    }
  };

  if (isActive) {
    sessionStorage.removeItem(POLL_STORAGE_KEY);

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

  if (isReturnSuccess && error) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>

        <h2 className="text-xl font-bold">Payment not completed</h2>

        <p className="text-sm text-muted-foreground">
          Your Paynow payment was not completed. Your SynthEdge subscription
          has not been activated.
        </p>

        <Button
          onClick={() => {
            sessionStorage.removeItem(POLL_STORAGE_KEY);
            window.location.href = `/checkout?plan=${planParam}`;
          }}
          variant="outline"
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (isReturnSuccess && !confirmTimedOut) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>

        <h2 className="text-xl font-bold">
          Confirming your payment…
        </h2>

        <p className="text-sm text-muted-foreground">
          Paynow has returned your payment result. We are confirming the
          transaction and activating your subscription.
        </p>

        {paymentStatus && (
          <p className="text-xs text-muted-foreground">
            Paynow status: {paymentStatus}
          </p>
        )}
      </div>
    );
  }

  if (isReturnSuccess && confirmTimedOut) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8 text-warning" />
        </div>

        <h2 className="text-xl font-bold">
          Payment confirmation pending
        </h2>

        <p className="text-sm text-muted-foreground">
          We could not confirm your payment yet. Your subscription has not
          been activated by the frontend. Please check your status again
          shortly.
        </p>

        <Button
          onClick={() => window.location.reload()}
          variant="outline"
        >
          Check Again
        </Button>
      </div>
    );
  }

  if (returnStatus === "cancelled") {
    sessionStorage.removeItem(POLL_STORAGE_KEY);

    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-warning" />
        </div>

        <h2 className="text-xl font-bold">Payment cancelled</h2>

        <p className="text-sm text-muted-foreground">
          You cancelled the Paynow checkout. No SynthEdge subscription was
          activated.
        </p>

        <Button
          onClick={() => {
            window.location.href = `/checkout?plan=${planParam}`;
          }}
          variant="outline"
        >
          Try Again
        </Button>
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
          {isAnnual
            ? "$99/year · Save 18% · 7-day free trial included"
            : "$10/month · 7-day free trial included"}
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
          <div
            key={f}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
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
            <p className="text-xs text-muted-foreground">
              EcoCash · Visa · Mastercard · ZimSwitch
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <Button
          className={
            isAnnual
              ? "w-full gap-2 bg-warning text-black hover:bg-warning/90"
              : "w-full gap-2"
          }
          onClick={handlePaynow}
          disabled={loading || subLoading}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Redirecting to Paynow…
            </>
          ) : isAnnual ? (
            <>
              <Zap className="w-4 h-4" />
              Pay $99/year with Paynow
            </>
          ) : (
            <>
              <ExternalLink className="w-4 h-4" />
              Pay $10/month with Paynow
            </>
          )}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center">
          You'll be redirected to Paynow's secure checkout. Your subscription
          activates automatically after payment confirmation.
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <Link to="/pricing" className="underline">
          View all plans
        </Link>{" "}
        · Secure payment via Paynow Zimbabwe
      </p>
    </div>
  );
}
