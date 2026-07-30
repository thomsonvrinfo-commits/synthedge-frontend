// Auth Worker entry point. Routes:
//   POST /auth/register
//   POST /auth/resend-otp
//   POST /auth/verify-otp
//   POST /auth/login
//   GET  /auth/google/start
//   GET  /auth/google/callback
//   POST /auth/forgot-password
//   POST /auth/reset-password
//   POST /auth/refresh
//   POST /auth/logout
//   GET  /auth/me
//   POST /auth/me   (update)
//
// Migration Master Plan Volume 2, Phase 2 (design) and Volume 6, Phase 13
// (this is the component with the most acceptance-critical test coverage —
// see workers/auth/src/router.test.ts).

import type { Env } from '@synthedge/shared';
import { jsonError, d1First } from '@synthedge/shared';
import { withSecurityHeaders } from '@synthedge/shared';

import { handleRegister, handleResendOtp, handleVerifyOtp } from './handlers/register';
import { handleLogin } from './handlers/login';
import { handleGoogleStart, handleGoogleCallback } from './handlers/google';
import { handleForgotPassword, handleResetPassword } from './handlers/passwordReset';
import { handleRefresh, handleLogout, handleMe, handleUpdateMe } from './handlers/tokens';
import { issueSessionTokens } from './session';

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

  if (path === '/auth/register' && method === 'POST') return handleRegister(request, env);
  if (path === '/auth/resend-otp' && method === 'POST') return handleResendOtp(request, env);
  if (path === '/auth/verify-otp' && method === 'POST') {
    // On successful verification, immediately issue a session — mirrors the
    // current base44.auth.verifyOtp -> setToken flow (one round trip from the
    // frontend's perspective, not two). Request bodies are single-read
    // streams in the Workers runtime, so the body is parsed exactly once
    // here and threaded through to both handleVerifyOtp and the session
    // issuance that follows it — NOT re-read via a second request.json()
    // call, which would throw.
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

  if (path === '/auth/login' && method === 'POST') return handleLogin(request, env);
  if (path === '/auth/google/start' && method === 'GET') return handleGoogleStart(env);
  if (path === '/auth/google/callback' && method === 'GET') return handleGoogleCallback(request, env);
  if (path === '/auth/forgot-password' && method === 'POST') return handleForgotPassword(request, env);
  if (path === '/auth/reset-password' && method === 'POST') return handleResetPassword(request, env);
  if (path === '/auth/refresh' && method === 'POST') return handleRefresh(request, env);
  if (path === '/auth/logout' && method === 'POST') return handleLogout(request, env);
  if (path === '/auth/me' && method === 'GET') return handleMe(request, env);
  // Frontend's api/client.ts uses PATCH for partial updates (REST convention);
  // POST is also accepted for back-compat with anything still calling it that way.
  if (path === '/auth/me' && (method === 'POST' || method === 'PATCH')) return handleUpdateMe(request, env);

  if (path === '/health' && method === 'GET') {
    return new Response(JSON.stringify({ ok: true, service: 'auth' }), {
      headers: { 'Content-Type': 'application/json' },
    });
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
