// /trading-rules — matches frontend/src/api/tradingRules.ts's contract:
// raw TradingRule / TradingRule[] bodies.
import type { Env } from "@synthedge/shared";
import { jsonError, d1First, d1All, d1Run, nowIso, ulid } from "@synthedge/shared";

interface AuthedUser {
  id: string;
  role: string;
}

function parseRuleRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  return { ...row, is_active: !!row.is_active };
}

export async function listTradingRules(env: Env, user: AuthedUser, url: URL): Promise<Response> {
  try {
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 500);
    const rows = await d1All(
      env.DB,
      `SELECT * FROM trading_rules WHERE created_by_id = ? ORDER BY created_date DESC LIMIT ?`,
      user.id,
      limit
    );
    return Response.json(rows.map((r) => parseRuleRow(r as Record<string, unknown>)));
  } catch (error: any) {
    console.error("listTradingRules error:", error);
    return jsonError(error.message ?? "Failed to list trading rules", 500);
  }
}

export async function createTradingRule(request: Request, env: Env, user: AuthedUser): Promise<Response> {
  try {
    const body = await request.json<any>().catch(() => null);
    if (!body || !body.title || !body.category) {
      return jsonError("title and category are required", 400);
    }

    const id = ulid();
    const now = nowIso();

    await d1Run(
      env.DB,
      `INSERT INTO trading_rules (id, created_by_id, title, description, category, is_active, violation_count, created_date, updated_date)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      id,
      user.id,
      body.title,
      body.description ?? null,
      body.category,
      body.is_active === false ? 0 : 1,
      now,
      now
    );

    const created = await d1First(env.DB, `SELECT * FROM trading_rules WHERE id = ?`, id);
    return Response.json(parseRuleRow(created));
  } catch (error: any) {
    console.error("createTradingRule error:", error);
    return jsonError(error.message ?? "Failed to create trading rule", 500);
  }
}

export async function updateTradingRule(request: Request, env: Env, user: AuthedUser, ruleId: string): Promise<Response> {
  try {
    const existing = await d1First(
      env.DB,
      `SELECT id FROM trading_rules WHERE id = ? AND created_by_id = ?`,
      ruleId,
      user.id
    );
    if (!existing) return jsonError("Trading rule not found", 404);

    const body = await request.json<any>().catch(() => null);
    if (!body) return jsonError("Invalid JSON body", 400);

    const setClauses: string[] = [];
    const values: unknown[] = [];

    if ("title" in body) { setClauses.push("title = ?"); values.push(body.title); }
    if ("description" in body) { setClauses.push("description = ?"); values.push(body.description ?? null); }
    if ("category" in body) { setClauses.push("category = ?"); values.push(body.category); }
    if ("is_active" in body) { setClauses.push("is_active = ?"); values.push(body.is_active ? 1 : 0); }
    if ("violation_count" in body) { setClauses.push("violation_count = ?"); values.push(body.violation_count); }

    setClauses.push("updated_date = ?");
    values.push(nowIso(), ruleId, user.id);

    await d1Run(
      env.DB,
      `UPDATE trading_rules SET ${setClauses.join(", ")} WHERE id = ? AND created_by_id = ?`,
      ...values
    );

    const updated = await d1First(env.DB, `SELECT * FROM trading_rules WHERE id = ?`, ruleId);
    return Response.json(parseRuleRow(updated));
  } catch (error: any) {
    console.error("updateTradingRule error:", error);
    return jsonError(error.message ?? "Failed to update trading rule", 500);
  }
}

export async function deleteTradingRule(env: Env, user: AuthedUser, ruleId: string): Promise<Response> {
  try {
    const result = await d1Run(
      env.DB,
      `DELETE FROM trading_rules WHERE id = ? AND created_by_id = ?`,
      ruleId,
      user.id
    );
    if (!result.meta || (result.meta as any).changes === 0) {
      return jsonError("Trading rule not found", 404);
    }
    return Response.json({});
  } catch (error: any) {
    console.error("deleteTradingRule error:", error);
    return jsonError(error.message ?? "Failed to delete trading rule", 500);
  }
}
