// Entities Worker. Routes:
//   GET    /health
//   GET    /me
//   GET    /trades              POST /trades
//   GET    /trades/:id          PATCH /trades/:id          DELETE /trades/:id
//   GET    /profile             POST /profile              PATCH /profile
//   GET    /trading-rules       POST /trading-rules
//   PATCH  /trading-rules/:id   DELETE /trading-rules/:id
//   GET    /replay-sessions     POST /replay-sessions
//   GET    /replay-sessions/:id PATCH /replay-sessions/:id DELETE /replay-sessions/:id
//
// broker/*, billing/*, and uploads/* are NOT implemented yet -- see
// SYNTHEDGE-COMPLETION-REPORT.md for what those need (Deriv/MT5 sync,
// Paynow polling, R2 upload signing) before the corresponding frontend
// api/*.ts modules will work end to end.

import type { Env } from "@synthedge/shared";
import { jsonError, withSecurityHeaders } from "@synthedge/shared";
import { requireUser } from "./auth";
import { listTrades, createTrade, getTrade, updateTrade, deleteTrade } from "./handlers/trades";
import { getProfile, createProfile, updateProfile } from "./handlers/profile";
import { listTradingRules, createTradingRule, updateTradingRule, deleteTradingRule } from "./handlers/tradingRules";
import {
  listReplaySessions,
  getReplaySession,
  createReplaySession,
  updateReplaySession,
  deleteReplaySession,
} from "./handlers/replaySessions";

function withCors(response: Response, appBaseUrl: string): Response {
  const headers = new Headers(response.headers);
  // A wildcard origin cannot be combined with credentialed requests (the
  // browser will reject the response outright) — every request from
  // api/client.ts now sends `credentials: "include"` so the auth Worker's
  // refresh cookie can reach it, so this has to echo the real app origin,
  // matching how workers/auth's withCors already works.
  headers.set("Access-Control-Allow-Origin", appBaseUrl);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  return new Response(response.body, { status: response.status, headers });
}

async function router(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (method === "OPTIONS") return new Response(null, { status: 204 });

  if (path === "/health" && method === "GET") {
    return Response.json({ ok: true, service: "entities" });
  }

  const user = await requireUser(request, env);

  if (path === "/me" && method === "GET") {
    if (!user) return jsonError("Unauthorized", 401);
    return Response.json({ ok: true, user });
  }

  // Every route below requires auth.
  if (!user) return jsonError("Unauthorized", 401);

  // -- /trades --------------------------------------------------------
  if (path === "/trades" && method === "GET") return listTrades(env, user, url);
  if (path === "/trades" && method === "POST") return createTrade(request, env, user);
  if (path.startsWith("/trades/")) {
    const id = path.split("/")[2];
    if (!id) return jsonError("Trade id is required", 400);
    if (method === "GET") return getTrade(env, user, id);
    if (method === "PATCH") return updateTrade(request, env, user, id);
    if (method === "DELETE") return deleteTrade(env, user, id);
  }

  // -- /profile ---------------------------------------------------------
  if (path === "/profile" && method === "GET") return getProfile(env, user);
  if (path === "/profile" && method === "POST") return createProfile(request, env, user);
  if (path === "/profile" && method === "PATCH") return updateProfile(request, env, user);

  // -- /trading-rules -----------------------------------------------------
  if (path === "/trading-rules" && method === "GET") return listTradingRules(env, user, url);
  if (path === "/trading-rules" && method === "POST") return createTradingRule(request, env, user);
  if (path.startsWith("/trading-rules/")) {
    const id = path.split("/")[2];
    if (!id) return jsonError("Trading rule id is required", 400);
    if (method === "PATCH") return updateTradingRule(request, env, user, id);
    if (method === "DELETE") return deleteTradingRule(env, user, id);
  }

  // -- /replay-sessions -----------------------------------------------------
  if (path === "/replay-sessions" && method === "GET") return listReplaySessions(env, user, url);
  if (path === "/replay-sessions" && method === "POST") return createReplaySession(request, env, user);
  if (path.startsWith("/replay-sessions/")) {
    const id = path.split("/")[2];
    if (!id) return jsonError("Replay session id is required", 400);
    if (method === "GET") return getReplaySession(env, user, id);
    if (method === "PATCH") return updateReplaySession(request, env, user, id);
    if (method === "DELETE") return deleteReplaySession(env, user, id);
  }

  return jsonError("Not found", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const response = await router(request, env);
      return withSecurityHeaders(withCors(response, env.APP_BASE_URL));
    } catch (err) {
      console.error("[entities] unhandled error", err);
      return withSecurityHeaders(jsonError("Internal server error", 500));
    }
  },
};
