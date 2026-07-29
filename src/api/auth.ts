/**
 * src/api/auth.ts
 *
 * Replaces `base44.auth.*` for the pieces migrated in Phase 1
 * (AuthContext, useCurrentUser, useSubscription).
 *
 * NOTE ON SCOPE: Login.jsx, Register.jsx, ForgotPassword.jsx, and
 * ResetPassword.jsx are NOT part of Phase 1 and still call `base44.auth.*`
 * directly today. This module is written so that migrating those pages
 * later is a drop-in swap (same parameter shapes as the base44 calls they
 * currently make) — see the mapping table below. Until those pages are
 * migrated, a real browser login will still go through Base44 and will NOT
 * populate the token this module reads (`synthedge_access_token`), so
 * `me()` here will resolve to "unauthenticated" in a live app until that
 * follow-up phase lands. This is expected and documented in the Phase 1
 * summary — nothing to fix in this file.
 *
 * base44 call                                   → this module
 * ---------------------------------------------  ------------------------
 * base44.auth.register({email, password})        register({email, password})
 * base44.auth.verifyOtp({email, otpCode})         verifyOtp({email, otpCode})
 * base44.auth.resendOtp(email)                    resendOtp(email)
 * base44.auth.setToken(token)                     setToken(token)
 * base44.auth.updateMe(data)                      updateMe(data)
 * base44.auth.loginViaEmailPassword(email, pw)    login(email, password)
 * base44.auth.loginWithProvider("google", url)    loginWithGoogle(url)
 * base44.auth.logout()                            logout()
 * base44.auth.me()                                me()
 * base44.auth.resetPasswordRequest(email)         requestPasswordReset(email)
 * base44.auth.resetPassword({resetToken, newPassword}) resetPassword({resetToken, newPassword})
 *
 * BACKEND CONTRACT ASSUMED (document/confirm with backend team; endpoints
 * not yet live should 404 gracefully rather than crash the app):
 *   POST   /auth/register            { email, password } -> { email }
 *   POST   /auth/verify-otp          { email, otpCode }   -> { access_token, user }
 *   POST   /auth/resend-otp          { email }            -> {}
 *   POST   /auth/login               { email, password }  -> { access_token, user }
 *   GET    /auth/google/start        (redirect flow)       ?redirect_to=<url>
 *   POST   /auth/logout              {}                    -> {}
 *   GET    /auth/me                  ->                     user | 401
 *   PATCH  /auth/me                  { ...fields }         -> user
 *   POST   /auth/password/forgot     { email }             -> {}
 *   POST   /auth/password/reset      { resetToken, newPassword } -> {}
 */
import { apiClient, ApiError, API_BASE_URL, setAuthToken, clearAuthToken, getAuthToken } from "@/api/client";

export interface AuthUser {
  id: string;
  email: string;
  full_name?: string;
  role?: "user" | "admin" | "developer";
  created_date?: string;
  [key: string]: unknown;
}

export interface LoginResponse {
  access_token: string;
  user: AuthUser;
}

export async function register({ email, password }: { email: string; password: string }): Promise<{ email: string }> {
  return apiClient.post<{ email: string }>("/auth/register", { email, password }, { auth: false });
}

export async function verifyOtp({ email, otpCode }: { email: string; otpCode: string }): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>("/auth/verify-otp", { email, otpCode }, { auth: false });
  if (res?.access_token) setAuthToken(res.access_token);
  return res;
}

export async function resendOtp(email: string): Promise<void> {
  await apiClient.post<void>("/auth/resend-otp", { email }, { auth: false });
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>("/auth/login", { email, password }, { auth: false });
  if (res?.access_token) setAuthToken(res.access_token);
  return res;
}

/**
 * Google OAuth: full contract (redirect target, callback route, token
 * exchange) is owned by the backend team and not finalized yet. This kicks
 * off the redirect using the assumed endpoint; update the path here once
 * confirmed — no other file should need to change.
 */
export function loginWithGoogle(redirectTo = "/"): void {
  const url = new URL(`${API_BASE_URL}/auth/google/start`, window.location.origin);
  url.searchParams.set("redirect_to", redirectTo);
  window.location.href = url.toString();
}

export function setToken(token: string): void {
  setAuthToken(token);
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

/**
 * Returns the current user, or null if not authenticated (401). Any other
 * failure (network error, 5xx) is re-thrown so callers can distinguish
 * "not logged in" from "something went wrong."
 */
export async function me(): Promise<AuthUser | null> {
  try {
    return await apiClient.get<AuthUser>("/auth/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function updateMe(data: Partial<AuthUser>): Promise<AuthUser> {
  return apiClient.patch<AuthUser>("/auth/me", data);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await apiClient.post<void>("/auth/password/forgot", { email }, { auth: false });
}

export async function resetPassword({ resetToken, newPassword }: { resetToken: string; newPassword: string }): Promise<void> {
  await apiClient.post<void>("/auth/password/reset", { resetToken, newPassword }, { auth: false });
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post<void>("/auth/logout", {});
  } catch {
    // best-effort — always clear the local token even if the network call fails
  } finally {
    clearAuthToken();
  }
}

/**
 * Starts the 7-day trial for a brand-new signup. Idempotent server-side
 * (matches base44/functions/initUserTrial's behavior — skips if already
 * initialized), and callers should treat this as fire-and-forget: a hiccup
 * here must never block onboarding.
 */
export async function initUserTrial(): Promise<void> {
  await apiClient.post<void>("/users/init-trial", {});
}
