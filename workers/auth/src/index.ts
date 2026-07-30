import type { Env } from '@synthedge/shared';

import {
  jsonError,
  d1First,
  withSecurityHeaders
} from '@synthedge/shared';

import { handleInitTrial } from './handlers/trial';
import { handleListConnections } from './handlers/broker';
import { handleListTrades } from './handlers/trades';

import {
  handleListReplaySessions,
  handleGetReplaySession,
  handleCreateReplaySession,
  handleUpdateReplaySession,
  handleDeleteReplaySession
} from './handlers/replaySessions';

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

  if ((path === '/auth/register' || path === '/api/auth/register') && method === 'POST') return handleRegister(request, env);
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

  if ((path === '/auth/login' || path === '/api/auth/login') && method === 'POST') return handleLogin(request, env);
  if (path === '/auth/google/start' && method === 'GET') return handleGoogleStart(env);
  if (path === '/auth/google/callback' && method === 'GET') return handleGoogleCallback(request, env);
  if (path === '/auth/forgot-password' && method === 'POST') return handleForgotPassword(request, env);
  if (path === '/auth/reset-password' && method === 'POST') return handleResetPassword(request, env);
  if (path === '/auth/refresh' && method === 'POST') return handleRefresh(request, env);
  if (path === '/auth/logout' && method === 'POST') return handleLogout(request, env);
  if (path === '/auth/me' && method === 'GET') return handleMe(request, env);
if (path === '/users/init-trial' && method === 'POST') {
  return new Response(
    JSON.stringify({
      success: true,
      message: "Trial initialized",
      subscription_status: "TRIAL",
      plan: "FREE"
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
if (path === '/profile' && method === 'GET') return handleMe(request, env);
  // Frontend's api/client.ts uses PATCH for partial updates (REST convention);
  // POST is also accepted for back-compat with anything still calling it that way.
  if (path === '/auth/me' && (method === 'POST' || method === 'PATCH')) return handleUpdateMe(request, env);
if (path === '/profile' && (method === 'POST' || method === 'PATCH'))
return handleUpdateMe(request, env);

  if (path === '/health' && method === 'GET') {
    return new Response(JSON.stringify({ ok: true, service: 'auth' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // Compatibility routes for existing SynthEdge frontend
  // These replace old Base44 API calls during migration

  if (path === '/users/init-trial' && method === 'POST') {
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Trial already initialized'
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  if (path === '/trading-rules' && method === 'GET') {
    return new Response(
      JSON.stringify([]),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

 if (path === '/trades' && method === 'GET') {
  return handleListTrades(request, env);
}
if (path === '/broker/connections' && method === 'GET') {
  return handleListConnections(request, env);
}
if (path === '/replay-sessions' && method === 'GET') {
  return handleListReplaySessions(request, env);
}

if (path === '/replay-sessions' && method === 'POST') {
  return handleCreateReplaySession(request, env);
}

if (path.startsWith('/replay-sessions/')) {

  const id = path.split('/')[2];

  if (!id) {
    return jsonError('Missing replay session id', 400);
  }

  if (method === 'GET') {
    return handleGetReplaySession(request, env, id);
  }

  if (method === 'PATCH') {
    return handleUpdateReplaySession(request, env, id);
  }

  if (method === 'DELETE') {
    return handleDeleteReplaySession(request, env, id);
  }
}

if (path === '/replay-sessions' && method === 'POST') {
  return handleCreateReplaySession(request, env);
}

if (path.startsWith('/replay-sessions/') ) {

  const id = path.split('/')[2];

  if (!id) {
    return jsonError('Missing replay session id', 400);
  }

  if (method === 'GET') {
    return handleGetReplaySession(request, env, id);
  }

  if (method === 'PATCH') {
    return handleUpdateReplaySession(request, env, id);
  }

  if (method === 'DELETE') {
    return handleDeleteReplaySession(request, env, id);
  }
}
if (path === '/replay-sessions' && method === 'POST') {
  return handleCreateReplaySession(request, env);
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
