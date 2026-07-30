// POST /auth/login  { email, password }
// Migration Master Plan Volume 2, Phase 2, Sections 2.1-2.2, 2.10.

import type { Env, UserRow } from '@synthedge/shared';
import { jsonError } from '@synthedge/shared';
import { verifyPassword } from '@synthedge/shared';
import { d1First } from '@synthedge/shared';
import { rateLimit, checkBruteForceLock, recordFailedAttempt, clearFailedAttempts } from '@synthedge/shared';
import { issueSessionTokens } from '../session';

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ email?: string; password?: string }>().catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!email || !password) return jsonError('email and password are required', 400);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';

  const perIpLimit = await rateLimit(env.KV, `login-ip:${ip}`, 20, 15 * 60);
  if (!perIpLimit.allowed) return jsonError('Too many login attempts from this network. Please try again later.', 429);

  const lock = await checkBruteForceLock(env.KV, `login:${email}`);
  if (!lock.allowed) {
    return jsonError(
      `Too many failed login attempts. Please try again in ${lock.retryAfterSeconds}s.`,
      429
    );
  }

  const user = await d1First<UserRow>(
    env.DB,
    'SELECT id, email, password_hash, role FROM users WHERE email = ?',
    email
  );

  // Deliberately identical response shape whether the account doesn't exist,
  // is Google-only (no password_hash), or the password is simply wrong — no
  // account-existence leakage via response differences.
  if (!user || !user.password_hash) {
    await recordFailedAttempt(env.KV, `login:${email}`);
    return jsonError('Invalid email or password', 401);
  }

  // Migration-specific: existing users migrated with password_hash = NULL are
  // caught by the branch above and directed through forced-reset instead
  // (Volume 2, Section 2.9) — this function does not special-case that here,
  // the frontend triggers /auth/forgot-password when it sees this exact 401
  // for a known-migrated account type, per the Phase 2 design.

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await recordFailedAttempt(env.KV, `login:${email}`);
    return jsonError('Invalid email or password', 401);
  }

  await clearFailedAttempts(env.KV, `login:${email}`);
  return issueSessionTokens(env, user);
}
