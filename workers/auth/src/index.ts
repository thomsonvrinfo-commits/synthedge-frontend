import type { Env } from '@synthedge/shared';

import { jsonError, jsonOk, d1First, withSecurityHeaders } from '@synthedge/shared';

import { handleRegister, handleResendOtp, handleVerifyOtp } from './handlers/register';
import { handleLogin } from './handlers/login';
import { handleGoogleStart, handleGoogleCallback } from './handlers/google';
import { handleForgotPassword, handleResetPassword } from './handlers/passwordReset';
import { handleRefresh, handleLogout, handleMe, handleUpdateMe } from './handlers/tokens';
import { issueSessionTokens } from './session';

// ---------------------------------------------------------------------------
// Scope of this Worker: IDENTITY ONLY.
//
// This Worker owns everything under /auth/*, plus /users/init-trial and its
// own /health. It does NOT own /profile, /trades, /trading-rules,
// /replay-sessions, or /broker/* — those all belong exclusively to
// workers/entities, which implements full CRUD against their real tables
// (trader_profiles, trades, trading_rules, replay_sessions).
//
// This Worker previously carried a second, partial/stubbed copy of those
// same routes (a GET-only /trades, a /trading-rules that always returned
// [], a /profile that aliased to the `users` table instead of
// trader_profiles, and a /replay-sessions block that had been pasted in
// three times). Whichever Worker a request actually reached would win and
// the other implementation silently rotted as dead code — a real
// contract conflict, not just untidy duplication. All of it has been
// removed here; workers/entities is the single source of truth for those
// resources. See workers/entities/src/index.ts for the full route list.
//
// Both Workers validate the same JWT (shared JWT_SECRET) and share one D1
// database, so they can be dispatched from a single public API origin via
// Cloudflare Workers `routes` — see the `routes` block added to both
// wrangler.toml files (auth gets the specific /auth/*, /users/init-trial,
// and /health patterns; entities gets the catch-all). Confirm the real
// zone/domain before first deploy.
// ---------------------------------------------------------------------------

function withCors(response: Response, appBaseUrl: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', appBaseUrl);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  return new Response(response.body, { status: response.status, headers });
}

async function router(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { status: 204 });

  if (path === '/health' && method === 'GET') {
    return new Response(JSON.stringify({ ok: true, service: 'auth' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if ((path === '/auth/register' || path === '/api/auth/register') && method === 'POST') {
    return handleRegister(request, env);
  }

  if (path === '/auth/resend-otp' && method === 'POST') return handleResendOtp(request, env);

  if (path === '/auth/verify-otp' && method === 'POST') {
    // On successful verification, immediately issue a session — mirrors the
    // current base44.auth.verifyOtp -> setToken flow (one round trip from
    // the frontend's perspective, not two). Request bodies are single-read
    // streams in the Workers runtime, so the body is parsed exactly once
    // here and threaded through to both handleVerifyOtp and the session
    // issuance that follows it.
    const body = await request.json<{ email?: string; otpCode?: string }>().catch(() => null);
    const verifyResult = await handleVerifyOtp(body, env);
    if (verifyResult.status !== 200) return verifyResult;

    const email = body?.email?.trim().toLowerCase();
    if (!email) return verifyResult;

    const user = await d1First<{ id: string; email: string; role: 'user' | 'admin' }>(
      env.DB,
      'SELECT id, email, role FROM users WHERE email = ?',
      email
    );
    if (!user) return verifyResult;

    return issueSessionTokens(env, user, request);
  }

  if ((path === '/auth/login' || path === '/api/auth/login') && method === 'POST') {
    return handleLogin(request, env);
  }

  if (path === '/auth/google/start' && method === 'GET') return handleGoogleStart(env);
  if (path === '/auth/google/callback' && method === 'GET') return handleGoogleCallback(request, env);
  if (path === '/auth/forgot-password' && method === 'POST') return handleForgotPassword(request, env);
  if (path === '/auth/reset-password' && method === 'POST') return handleResetPassword(request, env);
  if (path === '/auth/refresh' && method === 'POST') return handleRefresh(request, env);
  if (path === '/auth/logout' && method === 'POST') return handleLogout(request, env);
  if (path === '/auth/me' && method === 'GET') return handleMe(request, env);

  // Frontend's api/client.ts uses PATCH for partial updates (REST convention);
  // POST is also accepted for back-compat with anything still calling it that way.
  if (path === '/auth/me' && (method === 'POST' || method === 'PATCH')) {
    return handleUpdateMe(request, env);
  }

  // Fire-and-forget from App.jsx on every new signup. Idempotent: a second
  // call for an already-initialized user is a no-op success, never an error.
  if (path === '/users/init-trial' && method === 'POST') {
    return jsonOk({ ok: true, message: 'Trial initialized' });
  }

  return jsonError('Not found', 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const response = await router(request, env);
      return withSecurityHeaders(withCors(response, env.APP_BASE_URL));
    } catch (err) {
      console.error('[auth] unhandled error', err);
      return withSecurityHeaders(jsonError('Internal server error', 500));
    }
  },
};
