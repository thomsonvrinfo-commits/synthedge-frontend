// POST /auth/refresh  (reads se_refresh cookie, rotates it)
// POST /auth/logout    (revokes refresh token, clears cookie)
// GET  /auth/me         (returns current user, given a valid access token)
// Migration Master Plan Volume 2, Phase 2, Sections 2.2-2.3.

import type { AccessTokenPayload, Env, UserRow } from '@synthedge/shared';
import { jsonError, jsonOk } from '@synthedge/shared';
import { d1First, d1Run, nowIso, ulid, addDays } from '@synthedge/shared';
import { randomOpaqueToken, sha256Hex, signAccessToken, extractBearerToken, verifyAccessToken } from '@synthedge/shared';
import { readRefreshCookie, buildRefreshCookie, clearRefreshCookie, isSameOriginRequest } from '@synthedge/shared';

interface RefreshTokenRow {
  id: string;
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
}

export async function handleRefresh(request: Request, env: Env): Promise<Response> {
  if (!isSameOriginRequest(request, env.APP_BASE_URL)) {
    return jsonError('Cross-origin refresh requests are not allowed', 403);
  }

  const rawToken = readRefreshCookie(request);
  if (!rawToken) return jsonError('No refresh token provided', 401);

  const tokenHash = await sha256Hex(rawToken);
  const stored = await d1First<RefreshTokenRow>(
    env.DB,
    'SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?',
    tokenHash
  );

  const isProd = env.APP_BASE_URL.startsWith('https://');

  if (!stored || stored.revoked_at || new Date(stored.expires_at) < new Date()) {
    // Reused-after-revocation is a signal of token theft/replay: as a
    // precaution, revoke ALL of this user's sessions if we can identify them.
    if (stored?.revoked_at && stored.user_id) {
      await d1Run(
        env.DB,
        'UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
        nowIso(),
        stored.user_id
      );
    }
    const response = jsonError('Invalid or expired session. Please log in again.', 401);
    response.headers.append('Set-Cookie', clearRefreshCookie(isProd));
    return response;
  }

  const user = await d1First<UserRow>(env.DB, 'SELECT id, email, role FROM users WHERE id = ?', stored.user_id);
  if (!user) return jsonError('User not found', 401);

  // Rotate-on-use: revoke the old token, issue a brand new one. A replayed
  // old token will hit the revoked_at branch above on its next use.
  const newRawToken = randomOpaqueToken();
  const newTokenHash = await sha256Hex(newRawToken);
  const newTokenId = ulid();
  const now = new Date();
  const refreshTtlDays = env.REFRESH_TOKEN_TTL_DAYS ? parseInt(env.REFRESH_TOKEN_TTL_DAYS, 10) : 30;

  await d1Run(
    env.DB,
    `INSERT INTO refresh_tokens (id, user_id, token_hash, issued_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    newTokenId,
    user.id,
    newTokenHash,
    now.toISOString(),
    addDays(now, refreshTtlDays).toISOString()
  );
  await d1Run(
    env.DB,
    'UPDATE refresh_tokens SET revoked_at = ?, replaced_by_token_id = ? WHERE id = ?',
    now.toISOString(),
    newTokenId,
    stored.id
  );

  const accessTtlMin = env.ACCESS_TOKEN_TTL_MIN ? parseInt(env.ACCESS_TOKEN_TTL_MIN, 10) : 15;
  const accessToken = await signAccessToken({ sub: user.id, role: user.role }, env.JWT_SECRET, accessTtlMin * 60);

  const response = jsonOk({ ok: true, accessToken, accessTokenExpiresIn: accessTtlMin * 60 });
  response.headers.append('Set-Cookie', buildRefreshCookie(newRawToken, refreshTtlDays * 24 * 60 * 60, isProd));
  return response;
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const rawToken = readRefreshCookie(request);
  const isProd = env.APP_BASE_URL.startsWith('https://');

  if (rawToken) {
    const tokenHash = await sha256Hex(rawToken);
    await d1Run(
      env.DB,
      'UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL',
      nowIso(),
      tokenHash
    );
  }

  const response = jsonOk({ ok: true });
  response.headers.append('Set-Cookie', clearRefreshCookie(isProd));
  return response;
}

export async function requireAuth(request: Request, env: Env): Promise<AccessTokenPayload | Response> {
  const token = extractBearerToken(request);
  if (!token) return jsonError('Authentication required', 401);
  const result = await verifyAccessToken(token, env.JWT_SECRET);
  if (!result.valid || !result.payload) {
    return jsonError(
      result.reason === 'expired' ? 'Access token expired' : 'Invalid access token',
      401
    );
  }
  return result.payload;
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) return authResult;

  const user = await d1First<UserRow>(
    env.DB,
    `SELECT id, email, full_name, role, plan, subscription_status, trial_start_date, trial_end_date,
            subscription_start_date, subscription_end_date, payment_provider
     FROM users WHERE id = ?`,
    authResult.sub
  );
  if (!user) return jsonError('User not found', 404);

  return jsonOk({ ok: true, user });
}
export async function handleUpdateMe(request: Request, env: Env): Promise<Response> {
  const authResult = await requireAuth(request, env);
  if (authResult instanceof Response) return authResult;

  const body = await request.json<{
    full_name?: string;
    display_name?: string;
    goals?: string[];
    subscription_plan?: string;
    trial_end_date?: string;
  }>().catch(() => null);

  if (!body) {
    return jsonError('Invalid request body', 400);
  }

  const name = body.full_name ?? body.display_name ?? null;

  const goals = body.goals
    ? JSON.stringify(body.goals)
    : null;

  // Database only allows FREE or EARLY_ACCESS
  // Frontend sends "trial", so map it correctly
  let plan: string | null = null;

  if (body.subscription_plan) {
    const requestedPlan = body.subscription_plan.toLowerCase();

    if (requestedPlan === 'trial') {
      plan = 'FREE';
    } else if (requestedPlan === 'early_access') {
      plan = 'EARLY_ACCESS';
    } else if (requestedPlan === 'free') {
      plan = 'FREE';
    }
  }

  if (!name && !goals && !plan && !body.trial_end_date) {
    return jsonError('No fields provided', 400);
  }

  await d1Run(
    env.DB,
    `
    UPDATE users SET
      full_name = COALESCE(?, full_name),
      goals = COALESCE(?, goals),
      plan = COALESCE(?, plan),
      subscription_status = CASE
        WHEN ? = 'FREE' AND subscription_status IS NULL
        THEN 'TRIAL'
        ELSE subscription_status
      END,
      trial_end_date = COALESCE(?, trial_end_date),
      updated_date = ?
    WHERE id = ?
    `,
    name?.trim() ?? null,
    goals,
    plan,
    plan,
    body.trial_end_date ?? null,
    nowIso(),
    authResult.sub
  );

  return jsonOk({ 
    ok: true 
  });
}