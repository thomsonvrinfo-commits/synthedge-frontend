# Phase 1 — Frontend Foundation (Auth + Profile)

## Summary
Introduced a typed `src/api/` layer for auth and profile, migrated `AuthContext`, `useCurrentUser`, and `useSubscription` off the Base44 SDK, and left every other page/component untouched. Project builds clean (`vite build` exit 0).

## Files Created
- `src/api/client.ts` — fetch wrapper: base URL from `VITE_API_BASE_URL`, bearer-token auth, normalized `ApiError`, 401 listener hook
- `src/api/auth.ts` — register / verifyOtp / resendOtp / login / loginWithGoogle / logout / me / updateMe / requestPasswordReset / resetPassword / setToken
- `src/api/profile.ts` — getMyProfile / createProfile / updateProfile / getMyProfileAsList (cache-compat shim, see below)
- `src/context/AuthContext.jsx` — moved from `src/lib/AuthContext.jsx`, same exported shape (`user`, `isAuthenticated`, `isLoadingAuth`, `isLoadingPublicSettings`, `authError`, `appPublicSettings`, `authChecked`, `logout`, `navigateToLogin`, `checkUserAuth`, `checkAppState`)

## Files Modified
- `src/hooks/useCurrentUser.js` — `base44.auth.me()` → `me()`, `TraderProfile.filter(...)` → `getMyProfileAsList()`
- `src/hooks/useSubscription.js` — same swap, plus the trial-expiry auto-downgrade now calls `updateProfile({subscription_plan:"free"})`
- `src/App.jsx`, `src/components/ProtectedRoute.jsx` — import path updated to `@/context/AuthContext`

## Files Removed
- `src/lib/AuthContext.jsx` (superseded, no remaining references)

## Base44 Dependencies Removed (this phase)
- `base44.auth.me()` in `AuthContext`, `useCurrentUser`, `useSubscription`
- `base44.auth.logout()` in `AuthContext`
- `base44.entities.TraderProfile.filter/update` in `AuthContext`, `useCurrentUser`, `useSubscription`
- The Base44-proxy "public settings" axios call (`createAxiosClient` → `/api/apps/public/...`) — this was Base44's own multi-tenant hosting plumbing with no equivalent on the new backend, so it's gone rather than replaced; `isLoadingPublicSettings` is kept as a field (resolved in lockstep with auth) purely so `App.jsx` doesn't need to change yet.

**Still on base44 in these same files (intentionally, out of scope until Phase 2):** the workspace prefetch in `AuthContext` still calls `base44.entities.Trade/TradingRule/ReplaySession.filter(...)`.

## New Architecture
`src/api/client.ts` is the single place that knows how to reach the network (base URL, auth header, error shape). `auth.ts` and `profile.ts` sit on top of it and are the only things `AuthContext`/hooks import. Token is stored under a new key, `synthedge_access_token`, kept deliberately separate from Base44's own token keys so both systems coexist safely while the migration is incomplete.

## Backend Endpoints Required (Phase 1)
```
POST   /auth/register          { email, password }
POST   /auth/verify-otp        { email, otpCode } -> { access_token, user }
POST   /auth/resend-otp        { email }
POST   /auth/login             { email, password } -> { access_token, user }
GET    /auth/google/start      ?redirect_to=<url>  (redirect flow — contract not yet confirmed with backend team)
POST   /auth/logout
GET    /auth/me                -> user | 401
PATCH  /auth/me                { ...fields } -> user
POST   /auth/password/forgot   { email }
POST   /auth/password/reset    { resetToken, newPassword }
GET    /profile                -> TraderProfile | 404
POST   /profile                { ...fields } -> TraderProfile
PATCH  /profile                { ...fields } -> TraderProfile
```
None of these are assumed live yet — `auth.ts`/`profile.ts` are typed adapters against this contract per your instruction; nothing was invented beyond what the existing frontend already calls.

## ⚠️ Known Gap — Please Read Before Testing Login
`Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, and `ResetPassword.jsx` are **not** in Phase 1 scope and still call `base44.auth.*` directly. That means a real browser sign-in today still goes through Base44 and writes Base44's own token — it will **not** populate `synthedge_access_token`, so `AuthContext` (now on the new API) will read back "signed out" even right after a successful Base44 login. This is expected mid-migration, not a bug in the Phase 1 files — but since those four pages aren't listed in Phases 2–4 either, flagging that they'll need a home in the plan (Phase 2 alongside `auth.ts`'s consumers seems like the natural fit, since the API surface they need already exists now).

Two smaller items also fall outside Phase 1 but touch auth: `Sidebar.jsx` calls `base44.auth.logout()` directly (bypasses `AuthContext.logout()`'s cache-clearing), and the field-restriction question in `profile.ts`'s header comment (whether `PATCH /profile` should accept `subscription_plan` from the client) is worth a quick confirmation from the backend side before Phase 2 leans on it further.

## Verified
- `npm install` — clean
- `vite build` — exit 0, no errors
- `eslint` on touched files — 0 errors (pre-existing config just doesn't cover `.ts`/`src/context` glob patterns yet, unrelated to this change)

## Next
Ready for Phase 2 (`trades.ts`, `replaySessions.ts`, `tradingRules.ts`) whenever you want to proceed — say the word, or let me know if you'd like the Login/Register/etc. auth pages folded in alongside it.
