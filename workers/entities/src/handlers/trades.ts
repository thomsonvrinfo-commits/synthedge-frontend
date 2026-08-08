// /trades CRUD. Response shapes match the frontend contract documented in
// frontend/synthedge-frontend/src/api/trades.ts ("BACKEND CONTRACT ASSUMED"):
// raw Trade / Trade[] bodies, not wrapped in an {ok, ...} envelope — the
// frontend passes these straight into normalizeTrades()/array methods.
import type { Env } from "@synthedge/shared";
import { jsonError, d1First, d1All, d1Run, nowIso, ulid, extractOwnUploadKey } from "@synthedge/shared";

const SCREENSHOT_FIELDS = ["screenshot_url", "screenshot_before", "screenshot_during", "screenshot_after"] as const;

/** Best-effort R2 delete for a screenshot field's old value — never throws or blocks the D1 write. */
async function deleteOwnUploadIfAny(env: Env, request: Request, url: string | null | undefined): Promise<void> {
  if (!env.BUCKET) return;
  const origin = new URL(request.url).origin;
  const key = extractOwnUploadKey(url, origin);
  if (!key) return;
  try {
    await env.BUCKET.delete(key);
  } catch (err) {
    console.error("[trades] failed to delete orphaned upload", key, err);
  }
}

interface AuthedUser {
  id: string;
  role: string;
}

export async function listTrades(env: Env, user: AuthedUser, url: URL): Promise<Response> {
  try {
    const dataset = url.searchParams.get("dataset");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "500", 10) || 500, 1000);

    const results = dataset
      ? await d1All(
          env.DB,
          `SELECT * FROM trades WHERE created_by_id = ? AND dataset = ? ORDER BY created_date DESC LIMIT ?`,
          user.id,
          dataset,
          limit
        )
      : await d1All(
          env.DB,
          `SELECT * FROM trades WHERE created_by_id = ? ORDER BY created_date DESC LIMIT ?`,
          user.id,
          limit
        );

    return Response.json(results || []);
  } catch (error: any) {
    console.error("listTrades error:", error);
    return jsonError(error.message ?? "Failed to list trades", 500);
  }
}

export async function createTrade(request: Request, env: Env, user: AuthedUser): Promise<Response> {
  try {
    const body = await request.json<any>().catch(() => null);
    if (!body || !body.direction || body.entry_price === undefined || !body.result) {
      return jsonError("direction, entry_price, and result are required", 400);
    }

    const id = ulid();
    const now = nowIso();

    await d1Run(
      env.DB,
      `INSERT INTO trades (
        id, created_by_id, symbol, synthetic_index, direction, entry_price, exit_price,
        stop_loss, take_profit, lot_size, stake, rr, risk_reward_ratio, result, pl, profit_loss,
        setup, strategy, emotional_state, confidence_level, session, trade_date, notes,
        trade_reasoning, market_conditions, mistakes_made, lessons_learned, execution_rating,
        rule_violations, plan_followed, reflection_completed, dataset, source, replay_session_id,
        screenshot_url, screenshot_before, screenshot_during, screenshot_after, custom_fields,
        created_date, updated_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      user.id,
      body.symbol ?? null,
      body.synthetic_index ?? null,
      body.direction,
      body.entry_price,
      body.exit_price ?? null,
      body.stop_loss ?? null,
      body.take_profit ?? null,
      body.lot_size ?? null,
      body.stake ?? null,
      body.rr ?? null,
      body.risk_reward_ratio ?? null,
      body.result,
      body.pl ?? null,
      body.profit_loss ?? null,
      body.setup ?? null,
      body.strategy ?? null,
      body.emotional_state ?? null,
      body.confidence_level ?? null,
      body.session ?? null,
      body.trade_date ?? null,
      body.notes ?? null,
      body.trade_reasoning ?? null,
      body.market_conditions ?? null,
      body.mistakes_made ?? null,
      body.lessons_learned ?? null,
      body.execution_rating ?? null,
      body.rule_violations ? JSON.stringify(body.rule_violations) : null,
      body.plan_followed ?? null,
      body.reflection_completed ? 1 : 0,
      body.dataset ?? "LIVE",
      body.source ?? "MANUAL",
      body.replay_session_id ?? null,
      body.screenshot_url ?? null,
      body.screenshot_before ?? null,
      body.screenshot_during ?? null,
      body.screenshot_after ?? null,
      body.custom_fields ? JSON.stringify(body.custom_fields) : null,
      now,
      now
    );

    const created = await d1First(env.DB, `SELECT * FROM trades WHERE id = ?`, id);
    return Response.json(created);
  } catch (error: any) {
    console.error("createTrade error:", error);
    return jsonError(error.message ?? "Failed to create trade", 500);
  }
}

export async function getTrade(env: Env, user: AuthedUser, tradeId: string): Promise<Response> {
  try {
    const trade = await d1First(
      env.DB,
      `SELECT * FROM trades WHERE id = ? AND created_by_id = ?`,
      tradeId,
      user.id
    );
    if (!trade) return jsonError("Trade not found", 404);
    return Response.json(trade);
  } catch (error: any) {
    console.error("getTrade error:", error);
    return jsonError(error.message ?? "Failed to get trade", 500);
  }
}

// Fields the frontend's updateTrade() may send — mirrors Trade fields in
// api/trades.ts minus identity/audit columns, which are never client-writable.
const UPDATABLE_TRADE_FIELDS = [
  "symbol", "synthetic_index", "direction", "entry_price", "exit_price", "stop_loss",
  "take_profit", "lot_size", "stake", "rr", "risk_reward_ratio", "result", "pl",
  "profit_loss", "setup", "strategy", "emotional_state", "confidence_level", "session",
  "trade_date", "notes", "trade_reasoning", "market_conditions", "mistakes_made",
  "lessons_learned", "execution_rating", "plan_followed", "reflection_completed",
  "dataset", "source", "replay_session_id", "screenshot_url", "screenshot_before",
  "screenshot_during", "screenshot_after",
] as const;
const JSON_TRADE_FIELDS = new Set(["rule_violations", "custom_fields"]);

export async function updateTrade(request: Request, env: Env, user: AuthedUser, tradeId: string): Promise<Response> {
  try {
    const existing = await d1First<Record<string, unknown>>(
      env.DB,
      `SELECT id, screenshot_url, screenshot_before, screenshot_during, screenshot_after FROM trades WHERE id = ? AND created_by_id = ?`,
      tradeId,
      user.id
    );
    if (!existing) return jsonError("Trade not found", 404);

    const body = await request.json<any>().catch(() => null);
    if (!body) return jsonError("Invalid JSON body", 400);

    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const field of UPDATABLE_TRADE_FIELDS) {
      if (field in body) {
        setClauses.push(`${field} = ?`);
        values.push(body[field] ?? null);
      }
    }
    for (const field of JSON_TRADE_FIELDS) {
      if (field in body) {
        setClauses.push(`${field} = ?`);
        values.push(body[field] != null ? JSON.stringify(body[field]) : null);
      }
    }
    if ("reflection_completed" in body) {
      setClauses[setClauses.length - 1] = `reflection_completed = ?`;
      values[values.length - 1] = body.reflection_completed ? 1 : 0;
    }

    setClauses.push("updated_date = ?");
    values.push(nowIso());
    values.push(tradeId, user.id);

    await d1Run(
      env.DB,
      `UPDATE trades SET ${setClauses.join(", ")} WHERE id = ? AND created_by_id = ?`,
      ...values
    );

    const updated = await d1First(env.DB, `SELECT * FROM trades WHERE id = ?`, tradeId);

    // Best-effort cleanup: if a screenshot field was replaced (or cleared),
    // delete the old R2 object so uploads don't orphan indefinitely. Never
    // blocks or fails the response — the trade write already succeeded.
    for (const field of SCREENSHOT_FIELDS) {
      if (field in body) {
        const oldValue = existing[field] as string | null | undefined;
        const newValue = body[field] ?? null;
        if (oldValue && oldValue !== newValue) {
          await deleteOwnUploadIfAny(env, request, oldValue);
        }
      }
    }

    return Response.json(updated);
  } catch (error: any) {
    console.error("updateTrade error:", error);
    return jsonError(error.message ?? "Failed to update trade", 500);
  }
}

export async function deleteTrade(request: Request, env: Env, user: AuthedUser, tradeId: string): Promise<Response> {
  try {
    const existing = await d1First<Record<string, unknown>>(
      env.DB,
      `SELECT screenshot_url, screenshot_before, screenshot_during, screenshot_after FROM trades WHERE id = ? AND created_by_id = ?`,
      tradeId,
      user.id
    );

    const result = await d1Run(
      env.DB,
      `DELETE FROM trades WHERE id = ? AND created_by_id = ?`,
      tradeId,
      user.id
    );
    if (!result.meta || (result.meta as any).changes === 0) {
      return jsonError("Trade not found", 404);
    }

    if (existing) {
      for (const field of SCREENSHOT_FIELDS) {
        await deleteOwnUploadIfAny(env, request, existing[field] as string | null | undefined);
      }
    }

    return Response.json({});
  } catch (error: any) {
    console.error("deleteTrade error:", error);
    return jsonError(error.message ?? "Failed to delete trade", 500);
  }
}
