/**
 * updateTraderProfile - Allows users to update their own safe profile fields.
 * Explicitly excludes subscription_plan and trial_end_date.
 * Runs as service role to bypass the locked RLS rule.
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const SAFE_FIELDS = new Set([
  "display_name",
  "goals",
  "custom_strategies",
  "custom_fields",
  "dashboard_widgets",
  "account_size",
  "risk_per_trade",
  "max_daily_trades",
  "preferred_sessions",
  "preferred_indices",
  "timezone",
]);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    // Strip any fields not in the safe list
    const safeUpdate = {};
    for (const [key, value] of Object.entries(body)) {
      if (SAFE_FIELDS.has(key)) {
        safeUpdate[key] = value;
      } else {
        console.warn("updateTraderProfile: blocked field write attempt", {
          userId: user.id,
          field: key,
        });
      }
    }

    if (Object.keys(safeUpdate).length === 0) {
      return Response.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const profiles = await base44.asServiceRole.entities.TraderProfile.filter(
      { created_by_id: user.id },
      "-created_date",
      1,
    );

    if (!profiles.length) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }

    await base44.asServiceRole.entities.TraderProfile.update(
      profiles[0].id,
      safeUpdate,
    );

    console.log("updateTraderProfile: success", {
      userId: user.id,
      fields: Object.keys(safeUpdate),
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("updateTraderProfile error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
});