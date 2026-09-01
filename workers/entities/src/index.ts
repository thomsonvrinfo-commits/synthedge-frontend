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
//   GET    /subscription                       (Milestone 2 — centralized plan state;
//   POST   /subscription/trial/activate          see @synthedge/shared/subscription.ts
//   POST   /subscription/activate                 for the single source of truth every
//   POST   /subscription/cancel                    Worker should call instead of
//   GET    /subscription/payment-records           re-deriving plan/trial logic)
//   POST   /subscription/payment-records
//   POST   /uploads                            (Milestone 3 — R2-backed trade
//   GET    /uploads/:userId/:filename            screenshot storage; GET is
//                                                 public — see handlers/uploads.ts)
//   GET    /broker/connections                 (Milestone 4 — Deriv/MT5 sync;
//   POST   /broker/connect/deriv                 see src/broker/* for the
//   POST   /broker/connect/mt5                    ported Deriv WS + MetaAPI
//   POST   /broker/disconnect                     integration, and this
//   GET    /broker/trades                         Worker's scheduled() export
//   PATCH  /broker/trades/:id                     below for the cron trigger
//   POST   /broker/sync         (self, all own connections)
//   POST   /broker/sync-all     (admin-only, every connected account)
//   GET    /ai/conversations                   (Phase 4 foundation — AI Trading
//   POST   /ai/conversations                     Coach. See src/ai/* for the
//   GET    /ai/conversations/:id                  context engine, prompt
//   DELETE /ai/conversations/:id                  builder, and LLMProvider
//   POST   /ai/conversations/:id/messages          abstraction (OpenAI now).
//                                                   Streams an SSE response.

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
import {
  getSubscription,
  postActivateTrial,
  postCancel,
  postActivate,
  listPaymentRecords,
  createPaymentRecord,
} from "./handlers/subscription";
import { postUpload, getUpload } from "./handlers/uploads";
import {
  listConnections,
  connectDeriv,
  connectMt5,
  disconnectBroker,
  listBrokerTrades,
  updateBrokerTrade,
  postSync,
  postSyncAll,
  resolveSyncDeps,
} from "./handlers/broker";
import { syncAllConnections } from "./broker/sync";
import {
  listConversationsHandler,
  createConversationHandler,
  getConversationHandler,
  deleteConversationHandler,
  postMessage,
} from "./handlers/ai";

function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  // A wildcard origin cannot be combined with credentialed requests (the
  // browser will reject the response outright) — every request from
  // api/client.ts now sends `credentials: "include"` so the auth Worker's
  // refresh cookie can reach it, so this has to echo the real app origin,
  // matching how workers/auth's withCors already works.
  const origin = request.headers.get("Origin");
  const allowedOrigins = ["https://app.synthedgeapp.co.zw", "https://synthedgeapp.co.zw"];

  if (origin && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  return new Response(response.body, { status: response.status, headers });
}

async function router(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (method === "OPTIONS") return new Response(null, { status: 204 });

  if (path === "/health" && method === "GET") {
    return Response.json({ ok: true, service: "entities" });
  }

  // Public: an <img src="..."> request can't carry an Authorization header.
  // See handlers/uploads.ts for why this is safe (unguessable key, not a
  // capability an attacker can enumerate or infer).
  if (path.startsWith("/uploads/") && method === "GET") {
    const key = path.slice("/uploads/".length);
    return getUpload(env, key);
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
    if (method === "DELETE") return deleteTrade(request, env, user, id);
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

  // -- /subscription -----------------------------------------------------
  if (path === "/subscription" && method === "GET") return getSubscription(env, user);
  if (path === "/subscription/trial/activate" && method === "POST") return postActivateTrial(env, user);
  if (path === "/subscription/cancel" && method === "POST") return postCancel(env, user);
  if (path === "/subscription/activate" && method === "POST") return postActivate(request, env, user);
  if (path === "/subscription/payment-records" && method === "GET") return listPaymentRecords(env, user, url);
  if (path === "/subscription/payment-records" && method === "POST") return createPaymentRecord(request, env, user);

  // -- /uploads (POST only here — GET is handled above, before the auth gate) --
  if (path === "/uploads" && method === "POST") return postUpload(request, env, user);

  // -- /broker -----------------------------------------------------------
  if (path === "/broker/connections" && method === "GET") return listConnections(env, user);
  if (path === "/broker/connect/deriv" && method === "POST") return connectDeriv(request, env, user);
  if (path === "/broker/connect/mt5" && method === "POST") return connectMt5(request, env, user);
  if (path === "/broker/disconnect" && method === "POST") return disconnectBroker(request, env, user);
  if (path === "/broker/trades" && method === "GET") return listBrokerTrades(env, user, url);
  if (path.startsWith("/broker/trades/") && method === "PATCH") {
    const id = path.split("/")[3];
    if (!id) return jsonError("Broker trade id is required", 400);
    return updateBrokerTrade(request, env, user, id);
  }
  if (path === "/broker/sync" && method === "POST") return postSync(env, user);
  if (path === "/broker/sync-all" && method === "POST") return postSyncAll(env, user);

  // -- /ai ----------------------------------------------------------------
  if (path === "/ai/conversations" && method === "GET") return listConversationsHandler(env, user);
  if (path === "/ai/conversations" && method === "POST") return createConversationHandler(request, env, user);
  if (path.startsWith("/ai/conversations/")) {
    const parts = path.split("/"); // ["", "ai", "conversations", ":id", maybe "messages"]
    const id = parts[3];
    if (!id) return jsonError("Conversation id is required", 400);
    if (parts[4] === "messages" && method === "POST") return postMessage(request, env, user, id, ctx);
    if (!parts[4] && method === "GET") return getConversationHandler(env, user, id);
    if (!parts[4] && method === "DELETE") return deleteConversationHandler(env, user, id);
  }

  return jsonError("Not found", 404);
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    try {
      const response = await router(request, env, ctx);
      return withSecurityHeaders(withCors(response, request));
    } catch (err) {
      console.error("[entities] unhandled error", err);
      return withSecurityHeaders(jsonError("Internal server error", 500));
    }
  },

  // Cloudflare Cron Trigger (see wrangler.toml [triggers]). Runs the exact
  // same syncAllConnections() used by POST /broker/sync-all — cron is just
  // an unattended caller, not a separate code path. NOTE: this cannot be
  // exercised end-to-end in this sandbox (no scheduled-event runner, and
  // ws.derivws.com / api.metaapi.cloud are outside the network allowlist);
  // syncAllConnections()'s own logic is covered by integration tests using
  // fake Deriv/MetaAPI clients — verify actual cron firing + live sync
  // after deploying with real BROKER_ENC_KEY / METAAPI_TOKEN secrets.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      syncAllConnections(env, resolveSyncDeps(env)).then((results) => {
        const errors = results.filter((r) => r.error).length;
        console.log(`[entities] scheduled broker sync: processed=${results.length} errors=${errors}`);
      })
    );
  },
};

