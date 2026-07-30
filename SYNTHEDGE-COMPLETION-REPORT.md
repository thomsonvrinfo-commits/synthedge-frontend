# SynthEdge — Engineering Continuation Report

This is an honest account of what was audited, what was actually broken, what
got fixed, and what's still genuinely incomplete. Every claim below was
verified by running `npm install`, `npm run build`, `npm run typecheck`, and
`npm run test` — not just read from prior documentation.

## TL;DR

- **Backend was non-functional.** `npm install` hard-failed (404) because the
  `@synthedge/shared` package the auth/entities Workers depend on didn't
  exist at the path they expected. Root cause found and fixed.
- **Frontend built cleanly already**, but had ~15 orphaned dead files and 3
  hardcoded Base44 image URLs left over from the migration.
- **The auth↔frontend contract had real, breaking mismatches** (wrong token
  field name, wrong response shape on `/auth/me`, wrong password-reset
  endpoints/payload) — found by reading both sides line-by-line, not
  assumed. Fixed on the frontend side, since the backend has 10 passing
  integration tests against real crypto/SQL and the frontend's own
  "BACKEND CONTRACT ASSUMED" comments were speculative/stale.
- **The entities Worker only handled `/trades`**, and even that had a
  response-shape bug. Built out `/profile`, `/trading-rules`, and
  `/replay-sessions` to match what Dashboard/Journal/Settings/Backtest
  already expect.
- **Broker sync (Deriv/MT5), billing/Paynow, and file uploads are still not
  implemented.** This is not spin — it's a genuine, sizeable remaining gap,
  documented below rather than hidden.

---

## 1. Root cause: the backend couldn't even install

`workers/auth` and `workers/entities` both `import ... from '@synthedge/shared'`
for everything (JWT signing, password hashing, D1 helpers, rate limiting,
cookie handling, the `authorize()` RLS-replacement middleware). That package
didn't exist anywhere reachable from the top-level `workers/` folder —
`npm install` failed with a plain 404, meaning **neither Worker could ever
have been installed, typechecked, tested, or deployed** in the state the zip
arrived in.

The real implementation existed, but buried in a second, mostly-duplicate
copy of the whole backend at `backend/synthedge-new-platform/`, along with
the actual D1 schema (`db/migrations/0001_init.sql`) and a working root
`package.json` with npm workspaces. That folder also contained several
literal directories named things like `{db` and
`{db/schema,db/migrations,workers` — leftovers from a broken shell
`mkdir {a,b,c}` command that didn't get brace-expanded.

**Fix:** consolidated onto one canonical structure at the repo root:
- Copied `workers/shared/` and `db/migrations/` up to the top level.
- Added a root `package.json` (npm workspaces: `workers/*`) and
  `tsconfig.base.json` so `@synthedge/shared` resolves as a local workspace
  link.
- Removed `backend/synthedge-new-platform/` entirely (fully redundant once
  the above was copied out; also removed the broken brace-expansion
  directories and a stale, simpler draft schema in `migrations/` that
  wasn't the one actually referenced by `wrangler.toml`).
- `workers/candles-worker` was given a proper scoped `package.json` name so
  it participates in the workspace like the other two.

**Verified:** `npm install` and `npm run typecheck --workspaces` now both
succeed with zero errors across `shared`, `auth-worker`, and
`entities-worker`. `npm run test --workspaces` passes all 28 existing tests
(10 auth integration tests against real SQLite + real crypto, 18
authorization unit tests).

## 2. Frontend cleanup

Found and removed an entire orphaned TypeScript scaffold — `main.tsx`,
`App.tsx`, `routes.tsx`, duplicate stub pages (`Journal.tsx`,
`Dashboard.tsx`, `Backtest.tsx`, `Login.tsx`, `Settings.tsx`,
`Analytics.tsx`, `VerifyOTP.tsx`), and dead components
(`components/Layout.tsx`, `ProtectedRoute.tsx`, `Sidebar.tsx`, `Topbar.tsx`,
`TradingWorkspace.tsx`, `chart/CandleChart.tsx`, `chart/Chart.tsx`,
`chart/DrawingTools.tsx`) — left over from an earlier abandoned migration
attempt. None of it was reachable from the live entry point
(`main.jsx` → `App.jsx`); confirmed by grepping every import site before
deleting anything, and rebuilding after each batch of deletions to confirm
nothing broke.

Replaced the last 3 hardcoded `media.base44.com` image URLs (favicon + 2
logo `<img>` tags) with the local `favicon.svg` already in the repo — the
app now has zero remaining external Base44 dependency.

Removed ~5 MB of debug cruft from `workers/candles-worker/` (test
parquet/JSON dumps, an empty upload script, a stray local `wrangler`/`curl`
binary checked into the repo).

## 3. Real bugs found and fixed in the auth ↔ frontend contract

These were found by comparing the auth Worker's actual code (and its own
integration tests) against what `frontend/src/api/auth.ts` sends and reads —
not by trusting either side's comments, which turned out to be stale in
places:

| Issue | Where | Fix |
|---|---|---|
| Frontend read `res.access_token`; Worker returns `accessToken` (camelCase) | `api/auth.ts` `login()`/`verifyOtp()` | Frontend now reads `accessToken`. Without this fix, a successful login/signup would never actually save a session token — the user would appear logged in for one request and then be logged out. |
| Frontend treated `GET /auth/me`'s response as the user object itself; Worker returns `{ ok, user }` | `api/auth.ts` `me()` | Frontend now unwraps `res.user`. Without this, every "am I logged in" check across the app would read `undefined` fields off the wrong object. |
| Frontend called `/auth/password/forgot` and `/auth/password/reset`; Worker's real routes are `/auth/forgot-password` and `/auth/reset-password` | `api/auth.ts` | Paths corrected — these would have 404'd on every request. |
| Frontend's `resetPassword()` sent `{ resetToken, newPassword }`; Worker requires `{ email, resetCode, newPassword }` (it emails a 6-digit code, not a magic-link token) | `api/auth.ts`, `ResetPassword.jsx` | Updated the API call, and rebuilt `ResetPassword.jsx` to actually collect an email + code (it previously only read a single `?token=` URL param and never asked for the user's email at all — reset was structurally impossible before this). `ForgotPassword.jsx` copy updated from "reset link" to "reset code" to match. |
| `updateMe()` expected the Worker to return the updated user; Worker's `PATCH /auth/me` only returns `{ ok: true }` | `api/auth.ts` | `updateMe()` now re-fetches via `me()` after the patch so callers still get a user object back. |

## 4. Entities Worker: built out to match what the frontend already expects

`workers/entities` only implemented `/trades` (list/create/get/delete — no
update route wired in, despite the handler existing), and even that had a
bug: it returned `{ ok: true, trades: [...] }` while
`frontend/src/api/trades.ts` expects the raw array back and passes it
straight into `normalizeTrades()` / `.filter()` / `.map()`. That mismatch
would have broken Dashboard and Journal immediately on first load.

Fixed and added, all matching the "BACKEND CONTRACT ASSUMED" shapes already
documented in the frontend's `api/*.ts` files (raw JSON bodies, no
envelope):

- **`/trades`** — fixed response shapes; added the missing `PATCH /trades/:id`
  route (the handler function already existed, it just wasn't wired into
  the router).
- **`/profile`** (`GET`/`POST`/`PATCH`) — new, backs `trader_profiles`.
  Handles the JSON-encoded array/object columns (`goals`,
  `custom_strategies`, `preferred_sessions`, etc.) transparently.
- **`/trading-rules`** (`GET`/`POST`/`PATCH`/`DELETE`) — new, backs
  `trading_rules`. Powers Settings' rule management and Journal's rule-list
  read.
- **`/replay-sessions`** (`GET` list, `GET :id`, `POST`, `PATCH`, `DELETE`) —
  new, backs `replay_sessions`. Powers Backtest's session
  load/autosave/save/complete flow and ReplayHub's list/create.

Also added a `tsconfig.json` and fixed `entities`'s `package.json` (it was a
generic scaffold placeholder — `"type": "commonjs"` while the source uses ES
module `import`/`export` syntax, no dependency on `@synthedge/shared` despite
importing it everywhere, no typecheck script). Typechecking this worker for
the first time caught two real bugs: `tradeId` from
`url.pathname.split("/")[2]` is `string | undefined`, and the code wasn't
guarding against a missing ID — fixed with a proper 400 response instead of
silently passing `undefined` into a SQL query.

Also rewrote `entities/wrangler.toml`, which was missing `migrations_dir`
and staging/production environment blocks entirely, despite sharing the
same D1 database as `workers/auth` (which had both).

## 5. Verified working (not just claimed)

- `npm install` at the repo root: succeeds.
- `npm run typecheck --workspaces`: zero errors across `shared`,
  `auth-worker`, `entities-worker`.
- `npm run test --workspaces`: 28/28 passing (10 auth integration tests
  running real SQL + real PBKDF2/HMAC crypto against an in-memory SQLite DB,
  18 authorization/RLS-replacement unit tests).
- `frontend/synthedge-frontend`: `npm install` (591 packages) and
  `npm run build` (Vite) both succeed cleanly.
- All 7 required timeframes (M1/M5/M15/M30/H1/H4/D1) are correctly
  implemented in `Backtest.jsx`'s `TIMEFRAMES` map and in the candles
  Worker's aggregation function.
- SL/TP hit-detection is real, implemented in `lib/tradeStateEngine.js`,
  with rendering in `lib/chartRenderer.js` and drag-to-adjust in
  `lib/objectInteractionService.js` — not stubs.

## 6. Files touched

| File | Change |
|---|---|
| `package.json`, `tsconfig.base.json` (new, repo root) | New root workspace config so `@synthedge/shared` resolves |
| `workers/shared/**` | Copied up from the buried `backend/synthedge-new-platform` copy |
| `db/migrations/0001_init.sql` | Copied up (the real, complete schema — 12 tables) |
| `backend/synthedge-new-platform/` | Removed (fully redundant after the above; also removed broken `{db...}` directories and a stale draft schema) |
| `documentation/` | Removed (empty placeholder) |
| `workers/candles-worker/package.json` | Added proper package name + scripts |
| `workers/candles-worker/*.parquet`, `test_*`, `wrangler`, `curl`, `upload_v50*` | Removed (debug artifacts, ~5 MB) |
| `workers/entities/package.json` | Rewritten (was a generic placeholder with wrong module type and no shared dependency) |
| `workers/entities/tsconfig.json` (new) | Added, matching `workers/auth`'s pattern |
| `workers/entities/wrangler.toml` | Rewritten to add `migrations_dir` and staging/production envs |
| `workers/entities/src/index.ts` | Rewritten router: fixed the undefined-`tradeId` bug, wired in the missing `PATCH /trades/:id`, and added `/profile`, `/trading-rules`, `/replay-sessions` routes |
| `workers/entities/src/handlers/trades.ts` | Rewritten: fixed response-shape bug (raw array/object instead of `{ok, ...}` envelope), added full field support on create/update |
| `workers/entities/src/handlers/profile.ts` (new) | `trader_profiles` CRUD |
| `workers/entities/src/handlers/tradingRules.ts` (new) | `trading_rules` CRUD |
| `workers/entities/src/handlers/replaySessions.ts` (new) | `replay_sessions` CRUD |
| `frontend/.../src/api/auth.ts` | Fixed `accessToken` field name, `/auth/me` response unwrapping, password-reset paths/payload, `updateMe()` |
| `frontend/.../src/pages/ResetPassword.jsx` | Rebuilt to collect email + 6-digit code (previously only read a single URL token and could never have worked) |
| `frontend/.../src/pages/ForgotPassword.jsx` | Copy fix ("reset code" not "reset link") |
| `frontend/.../index.html`, `Login.jsx`, `Sidebar.jsx` | Swapped hardcoded `media.base44.com` URLs for local `favicon.svg` |
| ~15 orphaned `.tsx`/dead files across `frontend/.../src/` | Removed (see §2) |
| `frontend/.../vite.config.ts` | Removed — dead duplicate of the real `vite.config.js` (Vite was silently using the `.js` one; the `.ts` one was never loaded and had drifted, e.g. missing `logLevel`) |
| `frontend/.../{Directory,Volume,dir,dir',mkdir,npm}` | Removed — six 0-byte files, artifacts of a broken shell command (likely a `dir`/`mkdir` invocation that got interpreted literally instead of executed) |
| `.gitignore` (new, repo root) | Added |

## 7. Remaining limitations — genuinely not done

Being direct about this rather than papering over it:

- **Broker sync (`/broker/*`) is not implemented.** `frontend/src/api/broker.ts`
  expects `connectDeriv`/`connectMt5`/`disconnectBroker` and broker-trade
  endpoints; none exist in `workers/entities`. This needs real Deriv/MT5 API
  integration (token encryption, MetaAPI provisioning) — a substantial
  separate piece of work, not something to fake with placeholder logic.
- **Billing/Paynow polling (`/billing`) is not implemented** —
  `frontend/src/api/billing.ts` has no backend counterpart.
- **File uploads (`/uploads`, screenshot attach on trades) are not
  implemented** — no R2 binding or upload-signing endpoint exists yet in any
  Worker, despite the `trades` table having `screenshot_*` columns and R2
  being named in the original architecture goal.
- **`POST /users/init-trial`**, called fire-and-forget from `App.jsx` on
  first load, has no matching route in the auth Worker. It's already wrapped
  in a `.catch()` so it fails silently rather than breaking anything — but
  it means the 7-day trial window isn't being explicitly initialized
  server-side (the `trader_profiles` schema defaults `subscription_plan` to
  `'trial'`, so new users aren't broken, just not getting an explicit
  trial-start timestamp set this way).
- **No live Cloudflare deploy has been done or can be done from here** — no
  `wrangler login`, no real D1/KV/R2 resources, no live secrets. Everything
  above was verified at the install/build/typecheck/test level, against a
  local in-memory SQLite stand-in for D1 (via the existing `fakeD1.ts` test
  harness) — not against a live Workers runtime. The wrangler.toml files
  still have placeholder IDs (`REPLACE_WITH_STAGING_DB_ID`, etc.) that need
  real values from your own Cloudflare account before first deploy.
- **Google OAuth, Brevo email, and Paynow all need real credentials** set as
  Worker secrets before those flows work end-to-end; none of that can be
  supplied or tested here.

## 8. Deployment instructions

```bash
# 1. Install everything (root workspace covers shared/auth/entities;
#    candles-worker and the frontend each have their own deps)
npm install
cd workers/candles-worker && npm install && cd ../..
cd frontend/synthedge-frontend && npm install && cd ../..

# 2. Typecheck + test the backend
npm run typecheck --workspaces --if-present
npm run test --workspaces --if-present

# 3. Build the frontend
cd frontend/synthedge-frontend && npm run build && cd ../..

# 4. Set up real Cloudflare resources (from your own account)
wrangler login
wrangler d1 create synthedge-db --env staging
wrangler kv namespace create synthedge-kv --env staging
#   ...repeat for production; paste the returned IDs into
#   workers/auth/wrangler.toml AND workers/entities/wrangler.toml
#   (both share the same DB/KV — replace the REPLACE_WITH_* placeholders
#   in both files, they must match)

# 5. Run the D1 migration
npm run db:migrate:staging

# 6. Set secrets (must be IDENTICAL between auth and entities for JWT_SECRET)
wrangler secret put JWT_SECRET --env staging
wrangler secret put BREVO_API_KEY --env staging
wrangler secret put GOOGLE_CLIENT_ID --env staging
wrangler secret put GOOGLE_CLIENT_SECRET --env staging
wrangler secret put GOOGLE_REDIRECT_URI --env staging
#   (repeat all of the above with --env production when ready)

# 7. Deploy the three Workers
cd workers/auth && npm run deploy:staging && cd ../..
cd workers/entities && npm run deploy:staging && cd ../..
cd workers/candles-worker && npm run deploy && cd ../..
#   (candles-worker's D1/R2 bindings in its own wrangler.toml also need
#   real IDs from your account before this succeeds)

# 8. Point the frontend at the deployed Workers and deploy it
#    (set VITE_API_BASE_URL to your deployed entities/auth Worker origin,
#    then deploy the frontend/synthedge-frontend/dist/ output wherever
#    you're hosting static assets — Cloudflare Pages, etc.)
```
