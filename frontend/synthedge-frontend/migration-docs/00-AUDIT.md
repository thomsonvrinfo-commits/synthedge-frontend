# SynthEdge Frontend — Base44 Audit & Migration Map

Scope: `synthedgeApp-main` (React 18 + Vite + Tailwind + shadcn/ui + TanStack Query). This is the understanding/audit phase only — no code has been changed yet, per the migration brief.

---

## 1. Architecture Today

```
src/
  api/base44Client.js       ← single Base44 SDK instance, imported everywhere
  lib/AuthContext.jsx       ← owns auth state, calls base44.auth.me() + prefetches entities
  lib/app-params.js         ← reads appId/token from URL/localStorage (Base44-specific)
  lib/lifecycleEvents.js    ← fire-and-forget events → Cloudflare Worker → Brevo (already decoupled)
  lib/query-client.js       ← shared TanStack Query client
  hooks/useCurrentUser.js, useSubscription.js ← wrap base44.auth.me() + TraderProfile query
  pages/*.jsx                ← call base44 directly (no api/ abstraction layer exists yet)
  components/**/*.jsx        ← several also call base44 directly (not just pages)
```

**Key finding:** there is no `src/api/{trades,journal,replay,...}.ts` abstraction. Every page/component imports `base44` directly from `@/api/base44Client` and calls `.entities.X`, `.auth.X`, or `.functions.invoke(...)`. This is the main structural gap the migration must close — 27 files touch Base44 directly.

Good news: `lifecycleEvents.js` already talks to a plain Cloudflare Worker over `fetch()`, not the SDK — it's a working template for what the rest of the API layer should look like.

---

## 2. Base44 Dependency Inventory (every touchpoint)

### 2.1 SDK bootstrap
| File | Role |
|---|---|
| `src/api/base44Client.js` | Creates the `@base44/sdk` client from `appParams` |
| `src/lib/app-params.js` | Reads `app_id`/`access_token`/`functions_version`/`app_base_url` from URL params or `localStorage`, keyed `base44_*` |
| `src/lib/AuthContext.jsx` | Also imports `createAxiosClient` from `@base44/sdk/dist/utils/axios-client` directly to hit `/api/apps/public/prod/public-settings/by-id/:appId` |

### 2.2 Auth (`base44.auth.*`)
| Method | Used in |
|---|---|
| `loginViaEmailPassword` | `Login.jsx` |
| `loginWithProvider("google", ...)` | `Login.jsx`, `Register.jsx` |
| `register` | `Register.jsx` |
| `verifyOtp`, `resendOtp`, `setToken` | `Register.jsx` |
| `updateMe` | `Register.jsx` (sets `full_name` after OTP) |
| `resetPasswordRequest` | `ForgotPassword.jsx` |
| `resetPassword` | `ResetPassword.jsx` |
| `me` | `AuthContext.jsx`, `useCurrentUser.js`, `useSubscription.js`, `App.jsx`, `Onboarding.jsx`, `PageNotFound.jsx`, `lifecycleEvents.js` (email resolution fallback), `Backtest.jsx` |
| `logout` | `AuthContext.jsx` |

### 2.3 Entities (`base44.entities.*`) — all CRUD is client-side direct-to-DB via RLS today
| Entity | Ops used | Call sites |
|---|---|---|
| `Trade` | filter, create, update, delete | `Dashboard.jsx`, `Journal.jsx`, `Assistant.jsx`, `ReplayJournal.jsx`, `Backtest.jsx`, `QuickLogForm.jsx`, `QuickReflection.jsx`, `TradeForm.jsx` |
| `TraderProfile` | filter, create, update | `Dashboard.jsx`, `Journal.jsx`, `Assistant.jsx`, `Settings.jsx`, `Onboarding.jsx`, `useCurrentUser.js`, `useSubscription.js`, `AuthContext.jsx` (prefetch), `App.jsx` |
| `TradingRule` | filter, create, update, delete | `Journal.jsx`, `Settings.jsx`, `AuthContext.jsx` (prefetch) |
| `ReplaySession` | filter, get, list, create, update, delete | `Backtest.jsx`, `ReplayHub.jsx`, `Journal.jsx`, `AuthContext.jsx` (prefetch) |
| `BrokerConnection` | filter | `Performance.jsx`, `BrokerStatCards.jsx`, `BrokerTradesView.jsx`, `ConnectedAccounts.jsx` |
| `BrokerTrade` | filter, update | `Performance.jsx`, `BrokerStatCards.jsx`, `BrokerTradesView.jsx`, `BrokerTradeDetail.jsx` |
| `User`, `UserSubscription`, `PaymentRecord` | **not called directly from the frontend** — only touched server-side inside Base44 functions | n/a |

### 2.4 Functions (`base44.functions.invoke(name, payload)`)
| Function | Called from | Purpose (per `base44/functions/*/entry.ts`) |
|---|---|---|
| `initUserTrial` | `App.jsx` (fires once when onboarding not yet done) | Starts 7-day trial on User entity, idempotent |
| `updateTraderProfile` | `Settings.jsx` | Updates safe profile fields server-side (bypasses locked RLS on plan fields) |
| `connectDeriv` | `ConnectedAccounts.jsx` | Encrypts + stores Deriv API token, creates `BrokerConnection` |
| `connectMt5` | `ConnectedAccounts.jsx` | Creates MetaAPI account, stores `BrokerConnection` |
| `disconnectBroker` | `ConnectedAccounts.jsx` | Verifies ownership, revokes credential, marks connection `disconnected` |
| `pollPaynow` | `PaynowCheckout.jsx` | Fallback poll of Paynow status on checkout return |

Not called from the frontend but present server-side (invoked by other functions or cron): `derivSync`, `mt5Sync`, `reconcileTrades`, `checkSubscriptionExpiry`, `initiatePaynow`, `paynowWebhook`, `brevoTrackEvent`.

### 2.5 Integrations
| Call | File | Purpose |
|---|---|---|
| `base44.integrations.Core.UploadFile({ file })` | `TradeForm.jsx` | Uploads a trade screenshot, returns `file_url` |

### 2.6 Non-SDK Base44 references (cosmetic but real dependencies)
- `src/components/layout/Sidebar.jsx:45` — logo image hardcoded to `media.base44.com`
- `src/pages/Login.jsx:51` — same, on the login screen
These need to move to self-hosted static assets before Base44 can be fully removed.

---

## 3. Per-Page Summary

| Page | Base44 dependency | Non-Base44 concerns |
|---|---|---|
| `Login.jsx` | auth.loginViaEmailPassword, loginWithProvider, hardcoded logo URL | — |
| `Register.jsx` | auth.register/verifyOtp/resendOtp/setToken/updateMe/loginWithProvider | OTP flow is entirely Base44-shaped (email+password→OTP→token) |
| `ForgotPassword.jsx` / `ResetPassword.jsx` | auth.resetPasswordRequest / resetPassword | — |
| `Dashboard.jsx` | entities.Trade, TraderProfile | — |
| `Journal.jsx` | entities.Trade, TraderProfile, TradingRule, ReplaySession | Largest single consumer; also owns bulk-delete |
| `Backtest.jsx` (replay engine) | entities.ReplaySession (get/create/update/list/filter), Trade.create, auth.me | Heaviest page (1200+ lines); replay/chart engine itself (`chartEngine.js`, `replayEngine.js`, `objectInteractionService.js`) is pure client logic, no Base44 |
| `ReplayHub.jsx` | entities.ReplaySession (filter/create/delete/update), Trade.filter | — |
| `ReplayJournal.jsx` | entities.Trade.filter (dataset=BACKTEST) | — |
| `Assistant.jsx` | entities.Trade, TraderProfile | AI logic itself lives client-side, not a Base44 dependency |
| `Settings.jsx` | entities.TraderProfile, TradingRule; functions.invoke(updateTraderProfile) | — |
| `Onboarding.jsx` | auth.me, entities.TraderProfile (filter/create/update) | — |
| `PaynowCheckout.jsx` | functions.invoke(pollPaynow) | — |
| `Pricing.jsx` / `Upgrade.jsx` | none directly found | Likely just link out to `/checkout/paynow` or trigger `initiatePaynow` indirectly — verify during migration |
| `Performance.jsx` | entities.BrokerConnection, BrokerTrade | — |

Components with direct Base44 calls outside their owning page (flagged because they bypass any future page-level API boundary): `BrokerStatCards.jsx`, `BrokerTradeDetail.jsx`, `BrokerTradesView.jsx`, `TradeForm.jsx`, `QuickLogForm.jsx`, `QuickReflection.jsx`, `ConnectedAccounts.jsx`, `PageNotFound.jsx`.

---

## 4. Required Backend Endpoints (Cloudflare Worker, REST)

Derived strictly from what the frontend actually calls today — nothing invented. Auth style (bearer JWT vs cookie) is a backend-team decision; frontend just needs one `apiClient` with a single place to attach it.

**Auth**
- `POST /auth/register` — `{email, password}`
- `POST /auth/verify-otp` — `{email, otpCode}` → `{access_token, user}`
- `POST /auth/resend-otp` — `{email}`
- `POST /auth/login` — `{email, password}` → `{access_token, user}`
- `POST /auth/login/google` — OAuth redirect/callback flow
- `POST /auth/logout`
- `GET /auth/me` → current user
- `PATCH /auth/me` — `{full_name, ...}`
- `POST /auth/password/forgot` — `{email}`
- `POST /auth/password/reset` — `{resetToken, newPassword}`

**Trades** (`/trades`)
- `GET /trades?dataset=&limit=&sort=` (filter by owner is implicit from auth)
- `POST /trades`
- `PATCH /trades/:id`
- `DELETE /trades/:id`

**Trading Rules** (`/trading-rules`)
- `GET /trading-rules`
- `POST /trading-rules`
- `PATCH /trading-rules/:id`
- `DELETE /trading-rules/:id`

**Replay Sessions** (`/replay-sessions`)
- `GET /replay-sessions?limit=&sort=`
- `GET /replay-sessions/:id`
- `POST /replay-sessions`
- `PATCH /replay-sessions/:id`
- `DELETE /replay-sessions/:id`

**Trader Profile** (`/profile`)
- `GET /profile`
- `POST /profile` (create on onboarding)
- `PATCH /profile` — safe-fields only, server enforces the same `SAFE_FIELDS` allowlist currently in `updateTraderProfile/entry.ts` (excludes `subscription_plan`, `trial_end_date`)

**Broker Connections / Trades** (`/broker`)
- `GET /broker/connections`
- `POST /broker/connect/deriv` — `{api_token}`
- `POST /broker/connect/mt5` — `{login, password, server}`
- `POST /broker/disconnect` — `{connection_id}`
- `GET /broker/trades?account_type=&limit=&sort=`
- `PATCH /broker/trades/:id` — `{emotion_tag, note}`

**Billing**
- `POST /billing/paynow/initiate`
- `GET /billing/paynow/poll?reference=`
- `POST /billing/paynow/webhook` (server-to-server only)
- Stripe endpoints — **not yet implemented anywhere**, including in the current Base44 functions; this is a genuine gap, not just a migration item (matches the earlier launch-readiness audit finding).

**Lifecycle / trial**
- `POST /users/init-trial` (idempotent)

**Files**
- `POST /uploads` — multipart, returns `{file_url}`

Anything not listed here (e.g. `derivSync`, `mt5Sync`, `reconcileTrades`, `checkSubscriptionExpiry`) is server-internal/cron and the frontend never calls it — no frontend work needed, just confirm the Cloudflare team owns them.

---

## 5. Proposed `src/api/` Layer

```
src/api/
  client.ts        # fetch wrapper: base URL, auth header injection, JSON handling, error shape
  auth.ts           # register, verifyOtp, resendOtp, login, loginWithGoogle, logout, me, updateMe, forgotPassword, resetPassword
  trades.ts         # list, create, update, remove
  tradingRules.ts   # list, create, update, remove
  replaySessions.ts # list, get, create, update, remove
  profile.ts        # get, create, update
  broker.ts         # listConnections, connectDeriv, connectMt5, disconnect, listTrades, updateTrade
  billing.ts        # initiatePaynow, pollPaynow
  uploads.ts         # uploadFile
  types.ts          # shared TS interfaces mirrored from base44/entities/*.jsonc
```

Every function returns typed data and throws a normalized `ApiError`. Pages/hooks/components stop importing `@/api/base44Client` entirely and import from these modules instead — this alone removes the SDK from 27 files without touching UI/JSX logic in most of them (the entity calls are 1:1 swaps).

`AuthContext.jsx`'s parallel-prefetch pattern (public settings + `auth.me()` via `Promise.allSettled`, then fire-and-forget prefetch of `trades`/`tradingRules`/`replaySessions`/`profile` into the same React Query cache keys used by `Journal.jsx`/`Dashboard.jsx`) is a good pattern and should be preserved — it just needs its `base44.entities.X.filter(...)` calls swapped for `api/*.ts` calls with identical query keys.

---

## 6. What Should Explicitly NOT Change

- Chart/replay engine (`chartEngine.js`, `chartRenderer.js`, `replayEngine.js`, `indicatorEngine.js`, `objectInteractionService.js`, `objectTimeAnchor.js`) — pure client logic, zero Base44 coupling, do not touch.
- `derivWebSocket.js`, `historicalCandles.js`, `symbolSpecs.js` — talk directly to Deriv's public market-data WS, not Base44.
- `lifecycleEvents.js` — already Worker-based, just needs its `resolveEmail()` fallback swapped from `base44.auth.me()` to `api/auth.ts#me()`.
- `query-client.js`, TanStack Query cache-key strategy — keep as-is, only the `queryFn` bodies change.
- All shadcn/ui components, Tailwind config, styling, layout, navigation.

---

## 7. Open Items / Cannot Verify Without Backend Team

- Auth token transport (Authorization header vs httpOnly cookie) — determines whether `client.ts` needs manual header injection or just `credentials: 'include'`.
- Google OAuth callback shape from the new backend (Base44's `loginWithProvider` handled redirect + token exchange internally).
- Whether `Pricing.jsx`/`Upgrade.jsx` need any endpoint beyond what's listed — no direct Base44 calls were found in those two files; worth a manual read since they may call `initiatePaynow` via a link/redirect rather than `functions.invoke`.
- Stripe integration — no existing contract to migrate from; this is new work, not a swap.

---

## Next Step

Per the migration process (Understand → Audit → Identify dependencies → Remove Base44 → Introduce API abstraction → Test → Move on), this document completes steps 1–3. Recommended order for step 4–5: **Auth → `api/client.ts` → `AuthContext.jsx`** first (everything else depends on it), then Trades/TradingRules/ReplaySessions (shared query-key surface used by 6+ pages), then Broker/Billing (smaller, more isolated blast radius).

Say the word on which slice to start with and I'll produce the actual replacement files.
