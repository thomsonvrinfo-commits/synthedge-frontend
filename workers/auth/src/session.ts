// Shared session-token issuance used by login, post-OTP-verify, Google OAuth
// callback, and the refresh endpoint. Centralized here so the access-token
// claims, refresh-token TTL, and cookie shape are defined in exactly one
// place. Migration Master Plan Volume 2, Phase 2, Section 2.2.

import type { Env, UserRow } from '@synthedge/shared';
import { jsonOk } from '@synthedge/shared';
import { signAccessToken } from '@synthedge/shared';
import { randomOpaqueToken, sha256Hex } from '@synthedge/shared';
import { d1Run, nowIso, ulid, addDays } from '@synthedge/shared';
import { buildRefreshCookie } from '@synthedge/shared';

const DEFAULT_ACCESS_TTL_MIN = 15;
const DEFAULT_REFRESH_TTL_DAYS = 30;

export async function issueSessionTokens(
  env: Env,
  user: Pick<UserRow, 'id' | 'email' | 'role'>,
  request?: Request
): Promise<Response> {
  const accessTtlMin = env.ACCESS_TOKEN_TTL_MIN ? parseInt(env.ACCESS_TOKEN_TTL_MIN, 10) : DEFAULT_ACCESS_TTL_MIN;
  const refreshTtlDays = env.REFRESH_TOKEN_TTL_DAYS ? parseInt(env.REFRESH_TOKEN_TTL_DAYS, 10) : DEFAULT_REFRESH_TTL_DAYS;

  const accessToken = await signAccessToken({ sub: user.id, role: user.role }, env.JWT_SECRET, accessTtlMin * 60);

  const refreshToken = randomOpaqueToken();
  const refreshTokenHash = await sha256Hex(refreshToken);
  const refreshTokenId = ulid();
  const now = new Date();

  await d1Run(
    env.DB,
    `INSERT INTO refresh_tokens (id, user_id, token_hash, issued_at, expires_at, user_agent, ip_hint)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    refreshTokenId,
    user.id,
    refreshTokenHash,
    now.toISOString(),
    addDays(now, refreshTtlDays).toISOString(),
    request?.headers.get('User-Agent') ?? null,
    request?.headers.get('CF-Connecting-IP') ?? null
  );

  const isProd = env.APP_BASE_URL.startsWith('https://');
  const cookie = buildRefreshCookie(refreshToken, refreshTtlDays * 24 * 60 * 60, isProd);

  const response = jsonOk({
    ok: true,
    accessToken,
    accessTokenExpiresIn: accessTtlMin * 60,
    user: { id: user.id, email: user.email, role: user.role },
  });
  response.headers.append('Set-Cookie', cookie);
  return response;
}
