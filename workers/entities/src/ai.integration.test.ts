// Integration tests for the AI Trading Coach foundation: conversation
// persistence, the context engine, prompt construction, and the streaming
// route — run against a real SQLite DB (fakeD1) with a fake LLMProvider
// injected via AIOverrides (api.openai.com isn't reachable from this
// sandbox and no key is available — see ai/llm/openai.ts's docstring).

import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import { createFakeD1, createFakeKV } from "../../shared/src/test-utils/fakeD1";
import type { Env } from "@synthedge/shared";
import { signAccessToken, d1Run, d1First, nowIso, ulid } from "@synthedge/shared";
import worker from "./index";
import type { LLMProvider, LLMMessage } from "./ai/llm/provider";
import { buildCoachContext } from "./ai/context";
import { buildSystemPrompt } from "./ai/promptBuilder";

const SCHEMA_PATH = path.resolve(__dirname, "../../../db/migrations");
const JWT_SECRET = "test-secret-do-not-use-in-prod";

function makeEnv(): Env {
  return {
    DB: createFakeD1(SCHEMA_PATH),
    KV: createFakeKV(),
    JWT_SECRET,
    APP_BASE_URL: "http://localhost:5173",
  } as Env;
}

async function insertUser(env: Env): Promise<string> {
  const id = ulid();
  const now = nowIso();
  await d1Run(
    env.DB,
    `INSERT INTO users (id, email, password_hash, role, plan, subscription_status, created_date, updated_date)
     VALUES (?, ?, NULL, 'user', 'FREE', 'TRIAL', ?, ?)`,
    id,
    `${id}@example.com`,
    now,
    now
  );
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  return signAccessToken({ sub: userId, role: "user" }, JWT_SECRET, 900);
}

function req(method: string, path: string, token: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** A fake ExecutionContext whose waitUntil runs the promise immediately and is awaited by the test. */
function fakeCtx(): { ctx: ExecutionContext; drain: () => Promise<void> } {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => {
      pending.push(p);
    },
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
  return { ctx, drain: async () => { await Promise.all(pending); } };
}

function fakeProvider(chunks: string[] | (() => never)): LLMProvider {
  return {
    name: "fake",
    async *streamChat(_messages: LLMMessage[]) {
      if (typeof chunks === "function") {
        chunks(); // throws
        return;
      }
      for (const c of chunks) yield c;
    },
  };
}

async function readSSE(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()));
}

async function seedTrade(env: Env, userId: string, overrides: Record<string, unknown> = {}): Promise<void> {
  const now = nowIso();
  await d1Run(
    env.DB,
    `INSERT INTO trades (id, created_by_id, direction, entry_price, result, pl, setup, session, emotional_state, execution_rating, created_date, updated_date)
     VALUES (?, ?, 'Buy', 100, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ulid(),
    userId,
    (overrides.result as string) ?? "Win",
    (overrides.pl as number) ?? 10,
    (overrides.setup as string) ?? "Breakout",
    (overrides.session as string) ?? "London",
    (overrides.emotional_state as string) ?? "Calm",
    (overrides.execution_rating as number) ?? 8,
    now,
    now
  );
}

describe("Conversation CRUD and ownership", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("requires auth", async () => {
    const res = await worker.fetch(req("GET", "/ai/conversations", null), env);
    expect(res.status).toBe(401);
  });

  it("creates and lists conversations scoped to the caller", async () => {
    const userA = await insertUser(env);
    const userB = await insertUser(env);
    const tokenA = await tokenFor(userA);
    const tokenB = await tokenFor(userB);

    await worker.fetch(req("POST", "/ai/conversations", tokenA, { title: "Session review" }), env);
    await worker.fetch(req("POST", "/ai/conversations", tokenB, { title: "Other user's chat" }), env);

    const res = await worker.fetch(req("GET", "/ai/conversations", tokenA), env);
    const list = (await res.json()) as Array<{ title: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe("Session review");
  });

  it("a user cannot GET, DELETE, or post messages to another user's conversation", async () => {
    const owner = await insertUser(env);
    const other = await insertUser(env);
    const ownerToken = await tokenFor(owner);
    const otherToken = await tokenFor(other);

    const created = await worker.fetch(req("POST", "/ai/conversations", ownerToken, {}), env);
    const conv = (await created.json()) as { id: string };

    const getRes = await worker.fetch(req("GET", `/ai/conversations/${conv.id}`, otherToken), env);
    expect(getRes.status).toBe(404); // not 403 — existence isn't leaked either

    const delRes = await worker.fetch(req("DELETE", `/ai/conversations/${conv.id}`, otherToken), env);
    expect(delRes.status).toBe(404);

    const msgRes = await worker.fetch(
      req("POST", `/ai/conversations/${conv.id}/messages`, otherToken, { message: "hi" }),
      env
    );
    expect(msgRes.status).toBe(404);
  });

  it("deleting a conversation removes its messages too", async () => {
    const userId = await insertUser(env);
    const token = await tokenFor(userId);
    const created = await worker.fetch(req("POST", "/ai/conversations", token, {}), env);
    const conv = (await created.json()) as { id: string };

    await d1Run(
      env.DB,
      `INSERT INTO ai_messages (id, conversation_id, created_by_id, role, content, created_date) VALUES (?, ?, ?, 'user', 'hi', ?)`,
      ulid(),
      conv.id,
      userId,
      nowIso()
    );

    const delRes = await worker.fetch(req("DELETE", `/ai/conversations/${conv.id}`, token), env);
    expect(delRes.status).toBe(200);

    const remaining = await d1First(env.DB, `SELECT id FROM ai_messages WHERE conversation_id = ?`, conv.id);
    expect(remaining).toBeNull();
  });
});

describe("POST /ai/conversations/:id/messages — streaming + persistence", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  async function createConv(token: string): Promise<string> {
    const res = await worker.fetch(req("POST", "/ai/conversations", token, {}), env);
    const conv = (await res.json()) as { id: string };
    return conv.id;
  }

  it("returns 503 when no LLM provider is configured", async () => {
    const userId = await insertUser(env);
    const token = await tokenFor(userId);
    const convId = await createConv(token);
    const res = await worker.fetch(req("POST", `/ai/conversations/${convId}/messages`, token, { message: "hi" }), env);
    expect(res.status).toBe(503);
  });

  it("rejects an empty or missing message", async () => {
    const ai = await import("./handlers/ai");
    const userId = await insertUser(env);
    const convId = await createConv(await tokenFor(userId));
    const { ctx } = fakeCtx();

    const res = await ai.postMessage(
      new Request("http://x", { method: "POST", body: JSON.stringify({ message: "   " }) }),
      env,
      { id: userId, role: "user" },
      convId,
      ctx,
      { llmProvider: fakeProvider(["hi"]) }
    );
    expect(res.status).toBe(400);
  });

  it("rejects an over-length message", async () => {
    const ai = await import("./handlers/ai");
    const userId = await insertUser(env);
    const convId = await createConv(await tokenFor(userId));
    const { ctx } = fakeCtx();

    const res = await ai.postMessage(
      new Request("http://x", { method: "POST", body: JSON.stringify({ message: "x".repeat(5000) }) }),
      env,
      { id: userId, role: "user" },
      convId,
      ctx,
      { llmProvider: fakeProvider(["hi"]) }
    );
    expect(res.status).toBe(400);
  });

  it("streams deltas over SSE and persists both the user and assistant messages", async () => {
    const ai = await import("./handlers/ai");
    const userId = await insertUser(env);
    await seedTrade(env, userId);
    const convId = await createConv(await tokenFor(userId));
    const { ctx, drain } = fakeCtx();

    const res = await ai.postMessage(
      new Request("http://x", { method: "POST", body: JSON.stringify({ message: "How am I doing?" }) }),
      env,
      { id: userId, role: "user" },
      convId,
      ctx,
      { llmProvider: fakeProvider(["You're ", "doing ", "well."]) }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const events = await readSSE(res);
    const deltas = events.filter((e) => "delta" in e).map((e) => e.delta);
    expect(deltas.join("")).toBe("You're doing well.");
    expect(events[events.length - 1]).toMatchObject({ done: true });

    await drain(); // let the ctx.waitUntil'd D1 write finish

    const messages = await import("./ai/conversations").then((m) => m.listMessages(env, convId));
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", content: "How am I doing?" });
    expect(messages[1]).toMatchObject({ role: "assistant", content: "You're doing well." });
    expect(messages[1]!.context_summary).not.toBeNull();
  });

  it("persists partial assistant text and does not throw when the provider errors mid-stream", async () => {
    const ai = await import("./handlers/ai");
    const userId = await insertUser(env);
    const convId = await createConv(await tokenFor(userId));
    const { ctx, drain } = fakeCtx();

    const provider: LLMProvider = {
      name: "fake",
      async *streamChat() {
        yield "Partial answer";
        throw new Error("upstream 500");
      },
    };

    const res = await ai.postMessage(
      new Request("http://x", { method: "POST", body: JSON.stringify({ message: "hi" }) }),
      env,
      { id: userId, role: "user" },
      convId,
      ctx,
      { llmProvider: provider }
    );
    expect(res.status).toBe(200); // the HTTP response itself always succeeds; errors ride inside the stream

    const events = await readSSE(res);
    expect(events.some((e) => e.error === "upstream 500")).toBe(true);

    await drain();
    const messages = await import("./ai/conversations").then((m) => m.listMessages(env, convId));
    const assistantMsg = messages.find((m) => m.role === "assistant");
    expect(assistantMsg?.content).toBe("Partial answer");
    const summary = JSON.parse(assistantMsg!.context_summary!);
    expect(summary.truncatedByError).toBe(true);
  });

  it("does not persist an assistant message at all if the stream produced no text", async () => {
    const ai = await import("./handlers/ai");
    const userId = await insertUser(env);
    const convId = await createConv(await tokenFor(userId));
    const { ctx, drain } = fakeCtx();

    await ai.postMessage(
      new Request("http://x", { method: "POST", body: JSON.stringify({ message: "hi" }) }),
      env,
      { id: userId, role: "user" },
      convId,
      ctx,
      { llmProvider: fakeProvider(() => { throw new Error("immediate failure"); }) }
    );
    await drain();

    const messages = await import("./ai/conversations").then((m) => m.listMessages(env, convId));
    expect(messages).toHaveLength(1); // only the user's message
    expect(messages[0]!.role).toBe("user");
  });

  it("subsequent turns include prior conversation history in the LLM call", async () => {
    const ai = await import("./handlers/ai");
    const userId = await insertUser(env);
    const convId = await createConv(await tokenFor(userId));
    const { ctx, drain } = fakeCtx();

    let capturedMessages: LLMMessage[] = [];
    const capturingProvider: LLMProvider = {
      name: "fake",
      async *streamChat(messages) {
        capturedMessages = messages;
        yield "ok";
      },
    };

    await ai.postMessage(
      new Request("http://x", { method: "POST", body: JSON.stringify({ message: "First question" }) }),
      env,
      { id: userId, role: "user" },
      convId,
      ctx,
      { llmProvider: capturingProvider }
    );
    await drain();

    await ai.postMessage(
      new Request("http://x", { method: "POST", body: JSON.stringify({ message: "Second question" }) }),
      env,
      { id: userId, role: "user" },
      convId,
      ctx,
      { llmProvider: capturingProvider }
    );
    await drain();

    // system + "First question" (user) + "ok" (assistant) + "Second question" (user)
    const roles = capturedMessages.map((m) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "user"]);
    expect(capturedMessages.find((m) => m.role === "user" && m.content === "First question")).toBeTruthy();
    expect(capturedMessages[capturedMessages.length - 1]).toMatchObject({ content: "Second question" });
  });
});

describe("Context engine — data scoping and correctness", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("only includes the requesting user's own trades", async () => {
    const userA = await insertUser(env);
    const userB = await insertUser(env);
    await seedTrade(env, userA, { setup: "A-setup" });
    await seedTrade(env, userB, { setup: "B-setup" });

    const ctx = await buildCoachContext(env, userA);
    expect(ctx.stats.total).toBe(1);
    expect(ctx.recentTrades[0]!.setup).toBe("A-setup");
  });

  it("computes win rate and P/L correctly from seeded trades", async () => {
    const userId = await insertUser(env);
    await seedTrade(env, userId, { result: "Win", pl: 100 });
    await seedTrade(env, userId, { result: "Loss", pl: -50 });

    const ctx = await buildCoachContext(env, userId);
    expect(ctx.stats.total).toBe(2);
    expect(ctx.stats.wins).toBe(1);
    expect(ctx.stats.winRate).toBe(50);
  });

  it("returns a well-formed empty context for a user with no data", async () => {
    const userId = await insertUser(env);
    const ctx = await buildCoachContext(env, userId);
    expect(ctx.stats.total).toBe(0);
    expect(ctx.recentTrades).toHaveLength(0);
    expect(ctx.bestSetup).toBeNull();
  });
});

describe("Prompt construction — explainability and security", () => {
  it("system prompt instructs evidence-based, non-generic coaching (Phase 5)", async () => {
    const env = makeEnv();
    const userId = await insertUser(env);
    const ctx = await buildCoachContext(env, userId);
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("Never invent statistics");
    expect(prompt).toContain("cite the specific evidence");
  });

  it("system prompt explicitly forbids revealing credentials/secrets (Phase 8)", async () => {
    const env = makeEnv();
    const userId = await insertUser(env);
    const ctx = await buildCoachContext(env, userId);
    const prompt = buildSystemPrompt(ctx);
    expect(prompt.toLowerCase()).toContain("api keys");
  });

  it("never embeds raw secret env values in the prompt even if present in Env", async () => {
    const env = { ...makeEnv(), JWT_SECRET: "super-secret-value", BROKER_ENC_KEY: "another-secret" } as Env;
    const userId = await insertUser(env);
    const ctx = await buildCoachContext(env, userId);
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).not.toContain("super-secret-value");
    expect(prompt).not.toContain("another-secret");
  });
});
