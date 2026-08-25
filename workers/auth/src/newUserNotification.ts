// Owner notification for genuinely new SynthEdge accounts.
//
// Called from exactly two places, each only on the branch that has already
// confirmed a brand-new row was just inserted into `users`:
//   - handlers/register.ts:handleRegister (email/password signup)
//   - handlers/google.ts:handleGoogleCallback (inside the `if (!user)` branch)
//
// Deliberately NOT called from login, token refresh, or OTP verification —
// this must fire once per new account, never per session/request.
//
// Reuses the existing Brevo transactional-email client (sendTransactionalEmail,
// @synthedge/shared) rather than introducing a second email provider or a
// direct Gmail integration. That client already fails soft (catches its own
// errors, returns false, never throws) with one retry on 5xx/network
// failures — so a Brevo hiccup here can never turn a successful registration
// into a failed one.

import type { Env } from '@synthedge/shared';
import { sendTransactionalEmail } from '@synthedge/shared';

const DEFAULT_OWNER_EMAIL = 'SynthEdgeApp@gmail.com';

// Same sender as the existing OTP emails (handlers/register.ts) — the only
// address currently known to be verified in the production Brevo account.
// Swap to a synthedgeapp.co.zw address once one is verified there; using an
// unverified sender risks Brevo silently rejecting the send.
const SENDER = { name: 'SynthEdge', email: 'thomsonvr.info@gmail.com' };

export interface NewUserNotificationInput {
  userId: string;
  email: string;
  fullName?: string | null;
  signupMethod: 'Email/Password' | 'Google';
  createdAt: string; // ISO string, same `now` already computed at the call site
}

export async function notifyNewUserOwner(env: Env, user: NewUserNotificationInput): Promise<void> {
  console.log('[new-user-notification] requested', { userId: user.userId, signupMethod: user.signupMethod });

  if (!env.BREVO_API_KEY) {
    // Matches the existing OTP-email fallback behavior (register.ts) — don't
    // block or error in local/dev environments without a Brevo key configured.
    console.warn('[new-user-notification] BREVO_API_KEY not set; skipping owner email (dev only)');
    return;
  }

  const recipient = env.OWNER_NOTIFICATION_EMAIL || DEFAULT_OWNER_EMAIL;

  const createdDisplay = new Date(user.createdAt).toUTCString();

  const htmlContent = `
    <h2>New SynthEdge User</h2>
    <p>A new user has registered on SynthEdge.</p>
    <p><strong>Name:</strong> ${user.fullName ? escapeHtml(user.fullName) : '—'}</p>
    <p><strong>Email:</strong> ${escapeHtml(user.email)}</p>
    <p><strong>Signup method:</strong> ${user.signupMethod}</p>
    <p><strong>Account created:</strong> ${createdDisplay}</p>
    <p><strong>User ID:</strong> ${user.userId}</p>
    <p>— SynthEdge</p>
  `;

  try {
    // sendTransactionalEmail already fails soft internally (catches, returns
    // false) — this try/catch is defense-in-depth in case that contract ever
    // changes, not because it's expected to throw today.
    const ok = await sendTransactionalEmail(env.BREVO_API_KEY, {
      sender: SENDER,
      to: [{ email: recipient }],
      subject: '🚀 New SynthEdge User',
      htmlContent,
    });

    if (ok) {
      console.log('[new-user-notification] sent successfully', { userId: user.userId });
    } else {
      console.error('[new-user-notification] send failed (Brevo returned non-OK)', { userId: user.userId });
    }
  } catch (err) {
    console.error('[new-user-notification] unexpected error, registration unaffected', {
      userId: user.userId,
      err: String(err),
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
