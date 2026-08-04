// POST /users/init-trial
//
// AUDIT FINDING (Milestone 2): this route previously did nothing at all —
// workers/auth/src/index.ts hardcoded `{ ok: true, message: 'Trial
// initialized' }` without calling this file's handler, and this handler
// itself only ever SELECTed the user's trial fields (never set them),
// despite its name. So the trial window (trial_start_date/trial_end_date)
// was never actually being initialized anywhere in the codebase, by this
// route or otherwise.
//
// This now delegates to @synthedge/shared's activateTrial() — the same
// centralized function workers/entities uses for
// POST /subscription/trial/activate, and the same lazy-init logic
// resolveSubscription() applies automatically on first read. Calling this
// route is no longer strictly necessary for correctness (a subscription
// check anywhere will self-initialize the window regardless), but it gives
// the frontend's existing fire-and-forget call on first load a real,
// immediate effect instead of a no-op.

import type { Env } from '@synthedge/shared';
import { jsonError, jsonOk, verifyAccessToken, activateTrial } from '@synthedge/shared';

export async function handleInitTrial(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return jsonError('Unauthorized', 401);
  }

  const token = auth.replace('Bearer ', '');
  const result = await verifyAccessToken(token, env.JWT_SECRET);
  if (!result.valid || !result.payload?.sub) {
    return jsonError('Invalid token', 401);
  }

  const subscription = await activateTrial(env, result.payload.sub, result.payload.role);
  return jsonOk({ ok: true, subscription });
}
