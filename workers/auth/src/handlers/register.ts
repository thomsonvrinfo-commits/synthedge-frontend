// POST /auth/register  { email, password }
// Mirrors current Base44 flow: base44.auth.register -> OTP email -> verifyOtp.
// Migration Master Plan Volume 2, Phase 2, Section 2.5; Volume 6, Section 13.4.

import type { Env, UserRow } from '@synthedge/shared';
import { jsonError, jsonOk } from '@synthedge/shared';
import { hashPassword } from '@synthedge/shared';
import { d1First, d1Run, nowIso, ulid, addMinutes } from '@synthedge/shared';
import { randomOpaqueToken, sha256Hex } from '@synthedge/shared';
import { sendTransactionalEmail } from '@synthedge/shared';
import { rateLimit } from '@synthedge/shared';

const OTP_TTL_MINUTES = 10;

function generateOtpCode(): string {
  // 6-digit numeric code, cryptographically random.
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String((bytes[0] as number) % 1_000_000).padStart(6, '0');
}

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ email?: string; password?: string }>().catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;

  if (!email || !password) return jsonError('email and password are required', 400);
  if (password.length < 8) return jsonError('Password must be at least 8 characters', 400);

  const rl = await rateLimit(env.KV, `register:${email}`, 5, 60 * 60);
  if (!rl.allowed) return jsonError('Too many registration attempts. Please try again later.', 429);

  const existing = await d1First<UserRow>(env.DB, 'SELECT id FROM users WHERE email = ?', email);
  if (existing) return jsonError('An account with this email already exists', 409);

  const passwordHash = await hashPassword(password);
  const userId = ulid();
  const now = nowIso();

  await d1Run(
    env.DB,
    `INSERT INTO users (id, email, password_hash, role, plan, subscription_status, created_date, updated_date)
     VALUES (?, ?, ?, 'user', 'FREE', 'TRIAL', ?, ?)`,
    userId,
    email,
    passwordHash,
    now,
    now
  );

  await issueAndSendOtp(env, userId, email, 'signup_verify');

  return jsonOk({ ok: true, userId, message: 'Verification code sent to email' });
}

export async function issueAndSendOtp(
  env: Env,
  userId: string,
  email: string,
  purpose: 'signup_verify' | 'password_reset'
): Promise<void> {
  const code = generateOtpCode();
  const codeHash = await sha256Hex(code);
  const otpId = ulid();
  const expiresAt = addMinutes(new Date(), OTP_TTL_MINUTES).toISOString();

  await d1Run(
    env.DB,
    `INSERT INTO otp_codes (id, user_id, code_hash, purpose, expires_at, attempts, created_date)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    otpId,
    userId,
    codeHash,
    purpose,
    expiresAt,
    nowIso()
  );

  if (env.BREVO_API_KEY) {
    const subject = purpose === 'signup_verify' ? 'Verify your SynthEdge account' : 'Your SynthEdge password reset code';
  await sendTransactionalEmail(env.BREVO_API_KEY, {
  sender: {
    name: "SynthEdge",
    email: "thomsonvr.info@gmail.com"
},
  to: [{ email }],
  subject,
  htmlContent: `
    <h2>SynthEdge Verification</h2>
    <p>Your verification code is:</p>
    <h1>${code}</h1>
    <p>This code expires in ${OTP_TTL_MINUTES} minutes.</p>
  `,
});
  } else {
    // No Brevo key configured (e.g. local dev) — log so the flow is still testable.
    console.warn('[auth] BREVO_API_KEY not set; OTP code (dev only):', code);
  }
}

export async function handleResendOtp(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ email?: string }>().catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  if (!email) return jsonError('email is required', 400);

  const rl = await rateLimit(env.KV, `resend-otp:${email}`, 3, 15 * 60);
  if (!rl.allowed) return jsonError('Too many resend attempts. Please try again later.', 429);

  const user = await d1First<UserRow>(env.DB, 'SELECT id, email FROM users WHERE email = ?', email);
  // Deliberately return the same success response whether or not the account
  // exists, to avoid leaking account existence via this endpoint.
  if (user) await issueAndSendOtp(env, user.id, user.email, 'signup_verify');
  return jsonOk({ ok: true });
}

export async function handleVerifyOtp(
  body: { email?: string; otpCode?: string } | null,
  env: Env
): Promise<Response> {
  const email = body?.email?.trim().toLowerCase();
  const otpCode = body?.otpCode?.trim();
  if (!email || !otpCode) return jsonError('email and otpCode are required', 400);

  const rl = await rateLimit(env.KV, `verify-otp:${email}`, 8, 15 * 60);
  if (!rl.allowed) return jsonError('Too many verification attempts. Please try again later.', 429);

  const user = await d1First<UserRow>(env.DB, 'SELECT id, email, role FROM users WHERE email = ?', email);
  if (!user) return jsonError('Invalid verification code', 400);

  const codeHash = await sha256Hex(otpCode);
  const otp = await d1First<{ id: string; expires_at: string; consumed_at: string | null; attempts: number }>(
    env.DB,
    `SELECT id, expires_at, consumed_at, attempts FROM otp_codes
     WHERE user_id = ? AND purpose = 'signup_verify' AND code_hash = ?
     ORDER BY created_date DESC LIMIT 1`,
    user.id,
    codeHash
  );

  if (!otp || otp.consumed_at || new Date(otp.expires_at) < new Date()) {
    return jsonError('Invalid or expired verification code', 400);
  }

  await d1Run(env.DB, 'UPDATE otp_codes SET consumed_at = ? WHERE id = ?', nowIso(), otp.id);

  return jsonOk({ ok: true, verified: true });
  // NOTE: token issuance happens in index.ts's router immediately after this
  // call succeeds, using the same already-parsed body — kept separate from
  // verification itself so this handler has exactly one job and is easy to
  // unit test in isolation.
}
