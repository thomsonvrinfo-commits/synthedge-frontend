// /profile — matches frontend/src/api/profile.ts's contract exactly:
// GET returns the profile object or 404 (frontend converts 404 -> null),
// POST/PATCH return the (created/updated) profile object.
import type { Env } from "@synthedge/shared";
import { jsonError, d1First, d1Run, nowIso, ulid } from "@synthedge/shared";

interface AuthedUser {
  id: string;
  role: string;
}

const JSON_FIELDS = [
  "goals",
  "custom_strategies",
  "custom_fields",
  "dashboard_widgets",
  "preferred_sessions",
  "preferred_indices",
] as const;

function parseProfileRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  const parsed: Record<string, unknown> = { ...row };
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

export async function getProfile(env: Env, user: AuthedUser): Promise<Response> {
  try {
    const row = await d1First(env.DB, `SELECT * FROM trader_profiles WHERE created_by_id = ?`, user.id);
    if (!row) return jsonError("Profile not found", 404);
    return Response.json(parseProfileRow(row));
  } catch (error: any) {
    console.error("getProfile error:", error);
    return jsonError(error.message ?? "Failed to get profile", 500);
  }
}

export async function createProfile(request: Request, env: Env, user: AuthedUser): Promise<Response> {
  try {
    const existing = await d1First(env.DB, `SELECT id FROM trader_profiles WHERE created_by_id = ?`, user.id);
    if (existing) return jsonError("Profile already exists", 409);

    const body = await request.json<any>().catch(() => ({}));
    const id = ulid();
    const now = nowIso();

    await d1Run(
      env.DB,
      `INSERT INTO trader_profiles (
        id, created_by_id, display_name, goals, custom_strategies, custom_fields,
        dashboard_widgets, account_size, risk_per_trade, max_daily_trades,
        preferred_sessions, preferred_indices, timezone, subscription_plan,
        trial_end_date, created_date, updated_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      user.id,
      body.display_name ?? null,
      body.goals ? JSON.stringify(body.goals) : null,
      body.custom_strategies ? JSON.stringify(body.custom_strategies) : null,
      body.custom_fields ? JSON.stringify(body.custom_fields) : null,
      body.dashboard_widgets ? JSON.stringify(body.dashboard_widgets) : null,
      body.account_size ?? null,
      body.risk_per_trade ?? null,
      body.max_daily_trades ?? null,
      body.preferred_sessions ? JSON.stringify(body.preferred_sessions) : null,
      body.preferred_indices ? JSON.stringify(body.preferred_indices) : null,
      body.timezone ?? null,
      // subscription_plan / trial_end_date are never taken from the client
      // (see the SIMPLE_UPDATABLE_FIELDS note below) — always created as
      // 'trial' with no end date yet; resolveSubscription() initializes the
      // real window (and keeps this mirror in sync) the first time it's read.
      "trial",
      null,
      now,
      now
    );

    const created = await d1First(env.DB, `SELECT * FROM trader_profiles WHERE id = ?`, id);
    return Response.json(parseProfileRow(created));
  } catch (error: any) {
    console.error("createProfile error:", error);
    return jsonError(error.message ?? "Failed to create profile", 500);
  }
}

const SIMPLE_UPDATABLE_FIELDS = [
  "display_name",
  "account_size",
  "risk_per_trade",
  "max_daily_trades",
  "timezone",
  // NOTE (Milestone 2 — subscription centralization): subscription_plan and
  // trial_end_date used to be writable here, mirroring a permissive
  // (and exploitable — any authenticated user could self-grant "pro" with a
  // single PATCH /profile call) frontend behavior. Plan/trial state is now
  // exclusively server-computed by @synthedge/shared's resolveSubscription()
  // / activatePremium() / cancelPremium(), which also keep this table's
  // subscription_plan/trial_end_date columns in sync as a read-only mirror.
  // Deliberately NOT in this list anymore — do not re-add without routing
  // the write through the subscription module.
] as const;

export async function updateProfile(request: Request, env: Env, user: AuthedUser): Promise<Response> {
  try {
    const existing = await d1First(env.DB, `SELECT id FROM trader_profiles WHERE created_by_id = ?`, user.id);
    if (!existing) return jsonError("Profile not found", 404);

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

    if (setClauses.length === 0) {
      const current = await d1First(env.DB, `SELECT * FROM trader_profiles WHERE created_by_id = ?`, user.id);
      return Response.json(parseProfileRow(current));
    }

    setClauses.push("updated_date = ?");
    values.push(nowIso(), user.id);

    await d1Run(
      env.DB,
      `UPDATE trader_profiles SET ${setClauses.join(", ")} WHERE created_by_id = ?`,
      ...values
    );

    const updated = await d1First(env.DB, `SELECT * FROM trader_profiles WHERE created_by_id = ?`, user.id);
    return Response.json(parseProfileRow(updated));
  } catch (error: any) {
    console.error("updateProfile error:", error);
    return jsonError(error.message ?? "Failed to update profile", 500);
  }
}
