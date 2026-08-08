// /ai — AI Trading Coach conversations + streaming chat.
import type { Env } from "@synthedge/shared";
import { jsonError } from "@synthedge/shared";
import { buildCoachContext } from "../ai/context";
import { buildMessages } from "../ai/promptBuilder";
import {
  createConversation,
  listConversations,
  getConversation,
  listMessages,
  appendMessage,
  deleteConversation,
  toLLMHistory,
} from "../ai/conversations";
import type { LLMProvider } from "../ai/llm/provider";
import { createOpenAIProvider } from "../ai/llm/openai";

interface AuthedUser {
  id: string;
  role: "user" | "admin";
}

/** Test seam: production callers omit this and get the real OpenAI-backed provider. */
export interface AIOverrides {
  llmProvider?: LLMProvider;
}

export function resolveLLMProvider(env: Env, overrides?: AIOverrides): LLMProvider | null {
  if (overrides?.llmProvider) return overrides.llmProvider;
  if (!env.OPENAI_API_KEY) return null;
  return createOpenAIProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
}

const MAX_MESSAGE_LENGTH = 4000;

// -- GET /ai/conversations ----------------------------------------------------
export async function listConversationsHandler(env: Env, user: AuthedUser): Promise<Response> {
  const conversations = await listConversations(env, user.id);
  return Response.json(conversations);
}

// -- POST /ai/conversations ----------------------------------------------------
interface CreateConversationBody {
  title?: string;
}

export async function createConversationHandler(request: Request, env: Env, user: AuthedUser): Promise<Response> {
  const body = await request.json<CreateConversationBody>().catch(() => ({}) as CreateConversationBody);
  const conversation = await createConversation(env, user.id, body?.title);
  return Response.json(conversation, { status: 201 });
}

// -- GET /ai/conversations/:id (with messages) ---------------------------------
export async function getConversationHandler(env: Env, user: AuthedUser, id: string): Promise<Response> {
  const conversation = await getConversation(env, user.id, id);
  if (!conversation) return jsonError("Not found", 404);
  const messages = await listMessages(env, id);
  return Response.json({ conversation, messages });
}

// -- DELETE /ai/conversations/:id ------------------------------------------------
export async function deleteConversationHandler(env: Env, user: AuthedUser, id: string): Promise<Response> {
  const deleted = await deleteConversation(env, user.id, id);
  if (!deleted) return jsonError("Not found", 404);
  return Response.json({ ok: true });
}

// -- POST /ai/conversations/:id/messages (streaming) -----------------------------
interface PostMessageBody {
  message?: string;
}

export async function postMessage(
  request: Request,
  env: Env,
  user: AuthedUser,
  conversationId: string,
  ctx?: ExecutionContext,
  overrides?: AIOverrides
): Promise<Response> {
  const conversation = await getConversation(env, user.id, conversationId);
  if (!conversation) return jsonError("Not found", 404);

  const body = await request.json<PostMessageBody>().catch(() => null);
  const userMessage = body?.message?.trim();
  if (!userMessage) return jsonError("message is required", 400);
  if (userMessage.length > MAX_MESSAGE_LENGTH) {
    return jsonError(`message must be ${MAX_MESSAGE_LENGTH} characters or fewer`, 400);
  }

  const provider = resolveLLMProvider(env, overrides);
  if (!provider) {
    return jsonError("OPENAI_API_KEY not set. Run: wrangler secret put OPENAI_API_KEY", 503);
  }

  // Persist the user's message before calling the model, so it survives
  // even if generation fails outright.
  await appendMessage(env, conversationId, user.id, "user", userMessage);

  const priorMessages = await listMessages(env, conversationId);
  // The just-appended user message is last in priorMessages; buildMessages
  // appends the new user message itself, so history excludes it here.
  const history = toLLMHistory(priorMessages.slice(0, -1));

  const coachContext = await buildCoachContext(env, user.id);
  const llmMessages = buildMessages(coachContext, history, userMessage);

  const encoder = new TextEncoder();
  let assistantText = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let streamError: string | null = null;
      try {
        for await (const delta of provider!.streamChat(llmMessages, { maxTokens: 900 })) {
          assistantText += delta;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
        }
      } catch (e) {
        streamError = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: streamError })}\n\n`));
      } finally {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();

        // Persist whatever text was generated (even partial, on a
        // mid-stream error) so the conversation reflects what the user
        // actually saw. Uses ctx.waitUntil so this completes even if the
        // client disconnects the moment the stream closes.
        const save = async () => {
          if (!assistantText.trim()) return;
          const contextSummary = JSON.stringify({
            statsUsed: coachContext.stats,
            tradesConsidered: coachContext.recentTrades.length,
            activeRulesConsidered: coachContext.activeRules.length,
            replaySessionsConsidered: coachContext.recentReplaySessions.length,
            truncatedByError: streamError !== null,
          });
          await appendMessage(env, conversationId, user.id, "assistant", assistantText, contextSummary);
        };
        if (ctx) {
          ctx.waitUntil(save());
        } else {
          await save();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
