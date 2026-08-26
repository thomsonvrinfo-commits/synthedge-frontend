// /replay-sessions — matches frontend/src/api/replaySessions.ts's contract:
// raw ReplaySession / ReplaySession[] bodies; GET single returns 404 when
// missing (frontend's getReplaySession() converts that to null).
import type { Env } from "@synthedge/shared";
import { jsonError, d1First, d1All, d1Run, nowIso, ulid } from "@synthedge/shared";

interface AuthedUser {
  id: string;
  role: string;
}

const JSON_FIELDS = ["drawings", "session_trades", "stats", "rules_being_tested"] as const;

function parseSessionRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  const parsed: Record<string, unknown> = { ...row, completed: !!row.completed };
  for (const field of JSON_FIELDS) {
    const raw = parsed[field];
    if (typeof raw === "string") {
      try {
        parsed[field] = JSON.parse(raw);
      } catch {
        parsed[field] = null;
      }
    }
  }
  return parsed;
}

export async function listReplaySessions(env: Env, user: AuthedUser, url: URL): Promise<Response> {
  try {
    const status = url.searchParams.get("status");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 500);

    const rows = status
      ? await d1All(
          env.DB,
          `SELECT * FROM replay_sessions WHERE created_by_id = ? AND status = ? ORDER BY created_date DESC LIMIT ?`,
          user.id,
          status,
          limit
        )
      : await d1All(
          env.DB,
          `SELECT * FROM replay_sessions WHERE created_by_id = ? ORDER BY created_date DESC LIMIT ?`,
          user.id,
          limit
        );

    return Response.json(rows.map((r) => parseSessionRow(r as Record<string, unknown>)));
  } catch (error: any) {
    console.error("listReplaySessions error:", error);
    return jsonError(error.message ?? "Failed to list replay sessions", 500);
  }
}

export async function getReplaySession(env: Env, user: AuthedUser, sessionId: string): Promise<Response> {
  try {
    const row = await d1First(
      env.DB,
      `SELECT * FROM replay_sessions WHERE id = ? AND created_by_id = ?`,
      sessionId,
      user.id
    );
    if (!row) return jsonError("Replay session not found", 404);
    return Response.json(parseSessionRow(row));
  } catch (error: any) {
    console.error("getReplaySession error:", error);
    return jsonError(error.message ?? "Failed to get replay session", 500);
  }
}

export async function createReplaySession(request: Request, env: Env, user: AuthedUser): Promise<Response> {
  try {
    const body = await request.json<any>().catch(() => null);
    if (!body || !body.index_name || body.granularity === undefined) {
      return jsonError("index_name and granularity are required", 400);
    }

    const id = ulid();
    const now = nowIso();

    await d1Run(
  env.DB,
  `INSERT INTO replay_sessions (
    id, created_by_id, index_name, granularity, volume, visible_count, candle_start_epoch,
    drawings, session_trades, stats, name, completed, objective, status, started_at,
    completed_at, strategy_name, rules_being_tested, notes, conclusion,
    created_date, updated_date
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  id,
  user.id,
  body.index_name,
  body.granularity,
  body.volume ?? null,
  body.visible_count ?? null,
      body.candle_start_epoch ?? null,
      body.drawings ? JSON.stringify(body.drawings) : null,
      body.session_trades ? JSON.stringify(body.session_trades) : null,
      body.stats ? JSON.stringify(body.stats) : null,
      body.name ?? null,
      body.completed ? 1 : 0,
      body.objective ?? null,
      body.status ?? "active",
      body.started_at ?? now,
      body.completed_at ?? null,
      body.strategy_name ?? null,
      body.rules_being_tested ? JSON.stringify(body.rules_being_tested) : null,
      body.notes ?? null,
      body.conclusion ?? null,
      now,
      now
    );

    const created = await d1First(env.DB, `SELECT * FROM replay_sessions WHERE id = ?`, id);
    return Response.json(parseSessionRow(created));
  } catch (error: any) {
    console.error("createReplaySession error:", error);
    return jsonError(error.message ?? "Failed to create replay session", 500);
  }
}

const SIMPLE_UPDATABLE_FIELDS = [
  "index_name",
  "granularity",
  "volume",
  "visible_count",
  "candle_start_epoch",
  "name",
  "objective",
  "status",
  "started_at",
  "completed_at",
  "strategy_name",
  "notes",
  "conclusion",
] as const;

export async function updateReplaySession(request: Request, env: Env, user: AuthedUser, sessionId: string): Promise<Response> {
  try {
    const existing = await d1First(
      env.DB,
      `SELECT id FROM replay_sessions WHERE id = ? AND created_by_id = ?`,
      sessionId,
      user.id
    );
    if (!existing) return jsonError("Replay session not found", 404);

    const body = await request.json<any>().catch(() => null);
    if (!body) return jsonError("Invalid JSON body", 400);

    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const field of SIMPLE_UPDATABLE_FIELDS) {
      if (field in body) {
        setClauses.push(`${field} = ?`);
        values.push(body[field] ?? null);
      }
    }
    for (const field of JSON_FIELDS) {
      if (field in body) {
        setClauses.push(`${field} = ?`);
        values.push(body[field] != null ? JSON.stringify(body[field]) : null);
      }
    }
    if ("completed" in body) {
      setClauses.push("completed = ?");
      values.push(body.completed ? 1 : 0);
    }

    if (setClauses.length === 0) {
      const current = await d1First(env.DB, `SELECT * FROM replay_sessions WHERE id = ?`, sessionId);
      return Response.json(parseSessionRow(current));
    }

    setClauses.push("updated_date = ?");
    values.push(nowIso(), sessionId, user.id);

    await d1Run(
      env.DB,
      `UPDATE replay_sessions SET ${setClauses.join(", ")} WHERE id = ? AND created_by_id = ?`,
      ...values
    );

    const updated = await d1First(env.DB, `SELECT * FROM replay_sessions WHERE id = ?`, sessionId);
    return Response.json(parseSessionRow(updated));
  } catch (error: any) {
    console.error("updateReplaySession error:", error);
    return jsonError(error.message ?? "Failed to update replay session", 500);
  }
}

export async function deleteReplaySession(env: Env, user: AuthedUser, sessionId: string): Promise<Response> {
  try {
    const result = await d1Run(
      env.DB,
      `DELETE FROM replay_sessions WHERE id = ? AND created_by_id = ?`,
      sessionId,
      user.id
    );
    if (!result.meta || (result.meta as any).changes === 0) {
      return jsonError("Replay session not found", 404);
    }
    return Response.json({});
  } catch (error: any) {
    console.error("deleteReplaySession error:", error);
    return jsonError(error.message ?? "Failed to delete replay session", 500);
  }
}
