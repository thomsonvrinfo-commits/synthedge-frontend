// POST /auth/forgot-password  { email }
// POST /auth/reset-password   { resetToken, newPassword }
// Migration Master Plan Volume 2, Phase 2, Section 2.6; also used by the
// migration-specific forced-reset flow, Section 2.9.

import type { Env, UserRow } from '@synthedge/shared';
import { jsonError, jsonOk } from '@synthedge/shared';
import { hashPassword } from '@synthedge/shared';
import { d1First, d1Run, nowIso } from '@synthedge/shared';
import { rateLimit } from '@synthedge/shared';
import { sha256Hex } from '@synthedge/shared';
import { issueAndSendOtp } from './register';

export async function handleForgotPassword(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ email?: string }>().catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  if (!email) return jsonError('email is required', 400);

  const rl = await rateLimit(env.KV, `forgot-password:${email}`, 3, 15 * 60);
  if (!rl.allowed) return jsonError('Too many reset requests. Please try again later.', 429);

  const user = await d1First<UserRow>(env.DB, 'SELECT id, email FROM users WHERE email = ?', email);
  // Same-response-regardless-of-existence pattern as resendOtp, for the same reason.
  if (user) await issueAndSendOtp(env, user.id, user.email, 'password_reset');
  return jsonOk({ ok: true, message: 'If an account exists for this email, a reset code has been sent.' });
}

export async function handleResetPassword(request: Request, env: Env): Promise<Response> {
  const body = await request
    .json<{ email?: string; resetCode?: string; newPassword?: string }>()
    .catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  const resetCode = body?.resetCode?.trim();
  const newPassword = body?.newPassword;

  if (!email || !resetCode || !newPassword) {
    return jsonError('email, resetCode, and newPassword are required', 400);
  }
  if (newPassword.length < 8) return jsonError('Password must be at least 8 characters', 400);

  const rl = await rateLimit(env.KV, `reset-password:${email}`, 8, 15 * 60);
  if (!rl.allowed) return jsonError('Too many attempts. Please try again later.', 429);

  const user = await d1First<UserRow>(env.DB, 'SELECT id FROM users WHERE email = ?', email);
  if (!user) return jsonError('Invalid or expired reset code', 400);

  const codeHash = await sha256Hex(resetCode);

  const otp = await d1First<{ id: string; expires_at: string; consumed_at: string | null }>(
    env.DB,
    `SELECT id, expires_at, consumed_at FROM otp_codes
     WHERE user_id = ? AND purpose = 'password_reset' AND code_hash = ?
     ORDER BY created_date DESC LIMIT 1`,
    user.id,
    codeHash
  );

  if (!otp || otp.consumed_at || new Date(otp.expires_at) < new Date()) {
    return jsonError('Invalid or expired reset code', 400);
  }

  const newHash = await hashPassword(newPassword);
  const now = nowIso();

  await d1Run(env.DB, 'UPDATE users SET password_hash = ?, updated_date = ? WHERE id = ?', newHash, now, user.id);
  await d1Run(env.DB, 'UPDATE otp_codes SET consumed_at = ? WHERE id = ?', now, otp.id);

  // Security hardening beyond current verified Base44 behavior (Volume 2,
  // Section 2.6): invalidate every existing refresh token on password reset,
  // so a stolen session can't outlive a reset meant to kill it.
  await d1Run(env.DB, 'UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', now, user.id);

  return jsonOk({ ok: true, message: 'Password has been reset. Please log in.' });
}
