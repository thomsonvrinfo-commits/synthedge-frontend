/**
 * src/api/profile.ts
 *
 * Replaces `base44.entities.TraderProfile.*` for the pieces migrated in
 * Phase 1 (AuthContext, useCurrentUser, useSubscription).
 *
 * SCOPE NOTE: Dashboard.jsx, Journal.jsx, Assistant.jsx, Settings.jsx, and
 * Onboarding.jsx also read/write TraderProfile directly via base44 today
 * and are NOT touched in this phase (scheduled for Phase 3/4). They all
 * share the exact same TanStack Query cache key `["currentProfile", uid]`
 * as the hooks migrated here — see the "array-shape compatibility" note in
 * useCurrentUser.js / useSubscription.js for why this module's single-object
 * return value gets wrapped back into an array at the call site instead of
 * being changed here. Once those pages migrate too, that wrapping can be
 * removed and everyone can consume `getMyProfile()` directly.
 *
 * BACKEND CONTRACT ASSUMED (owner is implicit from the JWT — no more
 * `created_by_id` filter param needed):
 *   GET    /profile   -> TraderProfile | 404 if none created yet
 *   POST   /profile    { ...fields } -> TraderProfile
 *   PATCH  /profile    { ...fields } -> TraderProfile
 *
 * Field-level write restrictions: subscription_plan / trial_end_date are
 * READ-ONLY from the client's perspective as of Milestone 2 — the backend
 * silently ignores them if sent via POST/PATCH /profile (previously they
 * were writable, which let any authenticated user self-grant "pro"; closed
 * in workers/entities/src/handlers/profile.ts). Plan/trial state is now
 * exclusively managed via src/api/subscription.js's GET /subscription and
 * friends. useSubscription.js no longer writes to /profile at all.
 */
import { apiClient, ApiError } from "@/api/client";

export interface TraderProfile {
  id: string;
  display_name?: string;
  subscription_plan?: "trial" | "pro" | "free";
  trial_end_date?: string;
  goals?: unknown;
  custom_strategies?: unknown;
  custom_fields?: unknown;
  dashboard_widgets?: unknown;
  account_size?: number;
  risk_per_trade?: number;
  max_daily_trades?: number;
  preferred_sessions?: unknown;
  preferred_indices?: unknown;
  timezone?: string;
  created_date?: string;
  [key: string]: unknown;
}

/** Returns the current user's profile, or null if they haven't created one yet (fresh signup). */
export async function getMyProfile(): Promise<TraderProfile | null> {
  try {
    return await apiClient.get<TraderProfile>("/profile");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function createProfile(data: Partial<TraderProfile>): Promise<TraderProfile> {
  return apiClient.post<TraderProfile>("/profile", data);
}

export async function updateProfile(data: Partial<TraderProfile>): Promise<TraderProfile> {
  return apiClient.patch<TraderProfile>("/profile", data);
}

/**
 * Compatibility shim for the shared `["currentProfile", uid]` TanStack Query
 * cache entry (see the "SCOPE NOTE" above): returns `[profile]` / `[]`
 * instead of `profile | null`, matching what `TraderProfile.filter(...)`
 * used to return, so pages still on base44 (Dashboard, Journal, Assistant,
 * Settings, Onboarding) keep working unchanged against the same cache key.
 * Used by AuthContext, useCurrentUser, and useSubscription. Safe to delete
 * once every consumer of that cache key has migrated off base44.
 */
export async function getMyProfileAsList(): Promise<TraderProfile[]> {
  const profile = await getMyProfile();
  return profile ? [profile] : [];
}
