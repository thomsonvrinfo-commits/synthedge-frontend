/**
 * src/api/ai.ts
 *
 * AI Trading Coach — conversation CRUD + streaming chat.
 *
 * BACKEND CONTRACT:
 *   GET    /ai/conversations                -> ConversationRow[]
 *   POST   /ai/conversations   { title? }    -> ConversationRow
 *   GET    /ai/conversations/:id             -> { conversation, messages }
 *   DELETE /ai/conversations/:id             -> { ok: true }
 *   POST   /ai/conversations/:id/messages    { message } -> text/event-stream
 *     SSE frames: { delta: string } | { error: string } | { done: true }
 *
 * streamMessage() is a hand-rolled SSE reader rather than EventSource:
 * EventSource can only do unauthenticated GET, and this needs a POST body
 * plus an Authorization header.
 */
import { apiClient, ENTITY_API_URL, getAuthToken } from "@/api/client";

export async function listConversations() {
  return apiClient.get("/ai/conversations");
}

export async function createConversation(title) {
  return apiClient.post("/ai/conversations", title ? { title } : {});
}

export async function getConversation(id) {
  return apiClient.get(`/ai/conversations/${id}`);
}

export async function deleteConversation(id) {
  return apiClient.delete(`/ai/conversations/${id}`);
}

/**
 * Streams a coach reply for `message` in the given conversation.
 * Calls onDelta(text) as chunks arrive, onDone() when the stream closes
 * normally, onError(message) if the backend reports an error frame or the
 * request itself fails (e.g. network error, 503 when no LLM key is set).
 */
export async function streamMessage(conversationId, message, { onDelta, onDone, onError }) {
  let res;
  try {
    res = await fetch(`${ENTITY_API_URL}/ai/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken() ?? ""}`,
      },
      body: JSON.stringify({ message }),
    });
  } catch (e) {
    onError?.(e instanceof Error ? e.message : "Network error");
    return;
  }

  if (!res.ok || !res.body) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body?.error || detail;
    } catch {
      // non-JSON error body — keep the generic message
    }
    onError?.(detail);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        let payload;
        try {
          payload = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        if (payload.delta) onDelta?.(payload.delta);
        else if (payload.error) onError?.(payload.error);
        else if (payload.done) onDone?.();
      }
    }
  } finally {
    reader.releaseLock();
  }
}
