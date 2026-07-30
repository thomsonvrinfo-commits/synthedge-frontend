import type { Env } from '@synthedge/shared';
import { requireAuth } from './tokens';
import { jsonOk, d1All } from '@synthedge/shared';

export async function handleListTrades(
  request: Request,
  env: Env
): Promise<Response> {

  const authResult = await requireAuth(request, env);

  if (authResult instanceof Response) {
    return authResult;
  }

  const url = new URL(request.url);

  const limit = Math.min(
    Number(url.searchParams.get('limit') || 500),
    1000
  );

  const sort = url.searchParams.get('sort') || '-created_date';

  let orderBy = 'created_date DESC';

  if (sort === '-closed_at') {
    orderBy = 'closed_at DESC';
  }

  if (sort === 'created_date') {
    orderBy = 'created_date ASC';
  }

  const trades = await d1All(
    env.DB,
    `
    SELECT *
    FROM trades
    WHERE created_by_id = ?
    ORDER BY ${orderBy}
    LIMIT ?
    `,
    authResult.sub,
    limit
  );

  return jsonOk({
    trades
  });
}