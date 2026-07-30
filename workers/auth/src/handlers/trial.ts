import type { Env } from '@synthedge/shared';
import { jsonError, jsonOk, d1First, verifyAccessToken } from '@synthedge/shared';

export async function handleInitTrial(
  request: Request,
  env: Env
): Promise<Response> {

  const auth = request.headers.get('Authorization');

  if (!auth?.startsWith('Bearer ')) {
    return jsonError('Unauthorized', 401);
  }

  const token = auth.replace('Bearer ', '');

  const result = await verifyAccessToken(token, env.JWT_SECRET);

  if (!result.valid || !result.payload?.sub) {
    return jsonError('Invalid token', 401);
  }

  const userId = result.payload.sub;

  const user = await d1First(
    env.DB,
    `
    SELECT 
      id,
      plan,
      subscription_status,
      trial_start_date,
      trial_end_date
    FROM users
    WHERE id = ?
    `,
    userId
  );

  if (!user) {
    return jsonError('User not found', 404);
  }

  return jsonOk({
    ok: true,
    trial: user
  });
}