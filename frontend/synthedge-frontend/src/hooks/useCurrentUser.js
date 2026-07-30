import { useQuery } from "@tanstack/react-query";
import { me } from "@/api/auth";
import { getMyProfileAsList } from "@/api/profile";

export function useCurrentUser() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["currentUser"],
    queryFn: me,
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: !window.location.pathname.match(
      /^\/(login|register|forgot-password|reset-password)/
    ),
  });

  // Same key + same queryFn shape as useSubscription + AuthContext prefetch.
  // getMyProfileAsList() returns an array (compatibility shim — see
  // api/profile.ts) so every consumer of this cache key stays consistent.
  // Extract [0] here so callers of this hook get a single object.
  const { data: profiles } = useQuery({
    queryKey: ["currentProfile", user?.id],
    queryFn: getMyProfileAsList,
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  return {
    user,
    profile: profiles?.[0] || null,
    isLoading,
  };
}
