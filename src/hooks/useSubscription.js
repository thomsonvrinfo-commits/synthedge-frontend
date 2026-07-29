/**
 * useSubscription — Single source of truth for subscription/access state.
 *
 * Reads subscription_plan + trial_end_date from TraderProfile.
 * Handles auto-downgrade when trial has expired.
 *
 * hasFullAccess  — trial (active) or pro
 * isExpired      — trial ended and not upgraded
 * isTrial        — currently in 7-day trial
 * isActive       — paid pro plan
 * trialDaysLeft  — days remaining in trial (0 if expired/active)
 * isPro          — alias for hasFullAccess
 * isDeveloper    — role === "developer"
 * isAdmin        — role === "admin"
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { me as fetchCurrentUser } from "@/api/auth";
import { getMyProfileAsList, updateProfile } from "@/api/profile";
import { useMemo, useEffect } from "react";

const PUBLIC_PATHS = /^\/(login|register|forgot-password|reset-password)/;

export function useSubscription() {
  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ["currentUser"],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: !window.location.pathname.match(PUBLIC_PATHS),
  });

  // NOTE: auth.me() already returns `role` (admin/developer/user) — no need
  // for a separate User.filter round-trip.  Removed the ["currentUserRecord"]
  // query that was firing on every page mount via TrialBanner + AccessGate.

  const onCheckoutReturn =
    typeof window !== "undefined" &&
    window.location.pathname.includes("/checkout/paynow") &&
    new URLSearchParams(window.location.search).get("status") === "success";

  const { data: profiles = [], isLoading: profileLoading } = useQuery({
    queryKey: ["currentProfile", me?.id], // unified key — hits same cache as useCurrentUser + pages
    queryFn: getMyProfileAsList,
    enabled: !!me?.id,
    initialData: [],
    staleTime: onCheckoutReturn ? 0 : 5 * 60 * 1000,
    refetchOnWindowFocus: onCheckoutReturn,
  });

  const isLoading = profileLoading;
  const profile = profiles?.[0] || null;

  // Auto-downgrade: if trial has expired, update subscription_plan to "free"
  useEffect(() => {
    if (!profile) return;
    if (profile.subscription_plan !== "trial") return;
    if (!profile.trial_end_date) return;
    const expired = new Date(profile.trial_end_date) < new Date();
    if (expired) {
      // NOTE: writes subscription_plan directly, matching the existing
      // (pre-migration) frontend behavior — see the field-restriction note
      // in api/profile.ts for why this needs backend confirmation.
      updateProfile({ subscription_plan: "free" }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["currentProfile", me?.id] });
      });
    }
  }, [profile?.id, profile?.subscription_plan, profile?.trial_end_date]);

  const result = useMemo(() => {
    const userRecord = me; // auth.me() already includes role
    const role = me?.role || "user";
    const isDeveloper = role === "developer";
    const isAdmin = role === "admin";

    // Admin/developer always have full access
    if (isDeveloper || isAdmin) {
      return {
        hasFullAccess: true, isPro: true, isTrial: false, isActive: true,
        isExpired: false, trialDaysLeft: 0, isDeveloper, isAdmin,
        profile, userRecord, subscriptionStatus: "ACTIVE", plan: "EARLY_ACCESS",
      };
    }

    const plan = profile?.subscription_plan || "trial";

    // Calculate trial days remaining
    let trialDaysLeft = 0;
    let trialExpired = false;
    if (profile?.trial_end_date) {
      const diff = new Date(profile.trial_end_date) - new Date();
      trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      trialExpired = diff < 0;
    }

    const isTrial = plan === "trial" && !trialExpired;
    const isActive = plan === "pro";
    const isExpired = plan === "free" || (plan === "trial" && trialExpired);
    const hasFullAccess = isTrial || isActive;

    return {
      hasFullAccess,
      isPro: hasFullAccess,
      isTrial,
      isActive,
      isExpired,
      trialDaysLeft,
      isDeveloper,
      isAdmin,
      profile,
      userRecord,
      subscriptionStatus: isTrial ? "TRIAL" : isActive ? "ACTIVE" : "EXPIRED",
      plan,
    };
  }, [profiles, me]);

  return { ...result, isLoading };
}