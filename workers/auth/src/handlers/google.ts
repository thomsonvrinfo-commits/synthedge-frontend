// GET /auth/google/start           -> redirects to Google's consent screen
// GET /auth/google/callback?code=  -> exchanges code, creates/logs-in user
// Migration Master Plan Volume 2, Phase 2, Section 2.7; Volume 3, Section 5.5.

import type { Env, UserRow } from '@synthedge/shared';
import { jsonError } from '@synthedge/shared';
import { d1First, d1Run, nowIso, ulid } from '@synthedge/shared';
import { issueSessionTokens } from '../session';

export function handleGoogleStart(env: Env): Response {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    return jsonError('Google OAuth is not configured', 503);
  }
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 302);
}

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
}

interface GoogleUserInfo {
  email: string;
  email_verified: boolean;
  name?: string;
}

export async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    return jsonError('Google OAuth is not configured', 503);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return jsonError('Missing authorization code', 400);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return jsonError('Google authentication failed', 502);
  const tokenData = (await tokenRes.json()) as GoogleTokenResponse;

  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userInfoRes.ok) return jsonError('Failed to fetch Google profile', 502);
  const googleUser = (await userInfoRes.json()) as GoogleUserInfo;

  if (!googleUser.email_verified) return jsonError('Google email is not verified', 400);
  const email = googleUser.email.trim().toLowerCase();

  let user = await d1First<UserRow>(env.DB, 'SELECT id, email, role FROM users WHERE email = ?', email);

  if (!user) {
    // New Google signup — password_hash stays NULL forever for this account;
    // login.ts's password path will never succeed for it, which is correct.
    const userId = ulid();
    const now = nowIso();
    await d1Run(
      env.DB,
      `INSERT INTO users (id, email, full_name, role, plan, subscription_status, created_date, updated_date)
       VALUES (?, ?, ?, 'user', 'FREE', 'TRIAL', ?, ?)`,
      userId,
      email,
      googleUser.name ?? null,
      now,
      now
    );
    user = { id: userId, email, role: 'user' } as UserRow;
  }

  // Successful Google-authenticated response redirects back to the frontend
  // with tokens issued via a same-origin cookie + a one-time-use bridge; for
  // simplicity here we issue the session directly and redirect with the
  // access token in a URL fragment (never a query param, so it's not logged
  // server-side) for the SPA to pick up on load, matching the fragment-based
  // pattern the current AuthContext.jsx already uses for Base44 tokens.
  const sessionResponse = await issueSessionTokens(env, user, request);
  const sessionBody = (await sessionResponse.json()) as { accessToken: string };

  const redirectUrl = new URL(env.APP_BASE_URL);
  redirectUrl.hash = `access_token=${encodeURIComponent(sessionBody.accessToken)}`;

  const redirect = Response.redirect(redirectUrl.toString(), 302);
  const headers = new Headers(redirect.headers);
  const setCookie = sessionResponse.headers.get('Set-Cookie');
  if (setCookie) headers.append('Set-Cookie', setCookie);
  return new Response(null, { status: 302, headers });
}
