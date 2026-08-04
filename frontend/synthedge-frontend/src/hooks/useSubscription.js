/**
 * useSubscription — Single source of truth for subscription/access state.
 *
 * Milestone 2 update: this now reads the centralized GET /subscription
 * response (see @synthedge/shared's resolveSubscription on the backend)
 * instead of deriving plan/trial state from TraderProfile fields itself.
 * The backend already handles trial-window initialization and expiry
 * transitions server-side on every read, so the client-side auto-downgrade
 * effect (which used to PATCH subscription_plan directly on /profile) has
 * been removed entirely — that write is no longer accepted by the backend
 * anyway (see workers/entities/src/handlers/profile.ts).
 *
 * hasFullAccess  — trial (active) or premium
 * isExpired      — trial ended (or never started) and not upgraded
 * isTrial        — currently in the trial window
 * isActive       — paid premium plan
 * trialDaysLeft  — days remaining in trial (0 if expired/active)
 * isPro          — alias for hasFullAccess
 * isDeveloper    — always false today (no 'developer' role exists in the
 *                  schema — kept only so existing components destructuring
 *                  it don't need to change)
 * isAdmin        — role === "admin"
 */
import { useQuery } from "@tanstack/react-query";
import { me as fetchCurrentUser } from "@/api/auth";
import { getSubscription } from "@/api/subscription";
import { useMemo } from "react";

const PUBLIC_PATHS = /^\/(login|register|forgot-password|reset-password)/;

export function useSubscription() {
  const { data: me } = useQuery({
    queryKey: ["currentUser"],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: !window.location.pathname.match(PUBLIC_PATHS),
  });

  const onCheckoutReturn =
    typeof window !== "undefined" &&
    window.location.pathname.includes("/checkout/paynow") &&
    new URLSearchParams(window.location.search).get("status") === "success";

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["subscription", me?.id],
    queryFn: getSubscription,
    enabled: !!me?.id,
    // The backend re-evaluates trial/premium expiry on every read, so a
    // short staleTime here is what actually drives the "flip to expired
    // right when it happens" UX — no client-side write needed anymore.
    staleTime: onCheckoutReturn ? 0 : 60 * 1000,
    refetchOnWindowFocus: onCheckoutReturn,
  });

  const result = useMemo(() => {
    const isAdmin = me?.role === "admin";
    const isDeveloper = false; // no 'developer' role exists in the schema

    if (!subscription) {
      return {
        hasFullAccess: false, isPro: false, isTrial: false, isActive: false,
        isExpired: false, trialDaysLeft: 0, isDeveloper, isAdmin,
        userRecord: me, subscriptionStatus: undefined, plan: undefined,
        billingCycle: null,
      };
    }

    const isTrial = subscription.tier === "trial";
    const isActive = subscription.tier === "premium" && !isAdmin;
    const isExpired = subscription.tier === "free";

    return {
      hasFullAccess: subscription.hasFullAccess,
      isPro: subscription.hasFullAccess,
      isTrial,
      isActive: isActive || isAdmin,
      isExpired,
      trialDaysLeft: subscription.trialDaysLeft,
      isDeveloper,
      isAdmin,
      userRecord: me,
      subscriptionStatus: subscription.subscriptionStatus,
      plan: subscription.tier,
      billingCycle: subscription.billingCycle,
    };
  }, [subscription, me]);

  return { ...result, isLoading };
}
