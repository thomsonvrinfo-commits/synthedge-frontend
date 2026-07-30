/**
 * useProAccess — Backward-compatible wrapper around useSubscription.
 * Existing components can keep using useProAccess without changes.
 */
import { useSubscription } from "@/hooks/useSubscription";

export function useProAccess() {
  const sub = useSubscription();
  return {
    isPro: sub.hasFullAccess,
    isDeveloper: sub.isDeveloper,
    isAdmin: sub.isAdmin,
    sub: sub.sub,
    isLoading: sub.isLoading,
  };
}