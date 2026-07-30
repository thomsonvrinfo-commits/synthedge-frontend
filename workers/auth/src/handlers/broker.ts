import type { Env } from '@synthedge/shared';
import { requireAuth } from './tokens';
import { jsonOk, d1All } from '@synthedge/shared';

export async function handleListConnections(
  request: Request,
  env: Env
): Promise<Response> {

  const authResult = await requireAuth(request, env);

  if (authResult instanceof Response) {
    return authResult;
  }

  const connections = await d1All(
    env.DB,
    `
    SELECT *
    FROM broker_connections
    WHERE created_by_id = ?
    ORDER BY created_date DESC
    `,
    authResult.sub
  );

  return jsonOk({
    connections
  });
}