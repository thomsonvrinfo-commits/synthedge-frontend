// AI Coach — conversation persistence (D1). Every function here takes and
// enforces `userId` ownership; nothing above this layer should query
// ai_conversations/ai_messages directly.

import type { Env } from "@synthedge/shared";
import { d1All, d1First, d1Run, nowIso, ulid } from "@synthedge/shared";
import type { LLMMessage } from "./llm/provider";

export interface ConversationRow {
  id: string;
  created_by_id: string;
  title: string | null;
  created_date: string;
  updated_date: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  created_by_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  context_summary: string | null;
  created_date: string;
}

export async function createConversation(env: Env, userId: string, title?: string): Promise<ConversationRow> {
  const id = ulid();
  const now = nowIso();
  await d1Run(
    env.DB,
    `INSERT INTO ai_conversations (id, created_by_id, title, created_date, updated_date) VALUES (?, ?, ?, ?, ?)`,
    id,
    userId,
    title ?? null,
    now,
    now
  );
  return { id, created_by_id: userId, title: title ?? null, created_date: now, updated_date: now };
}

export async function listConversations(env: Env, userId: string, limit = 50): Promise<ConversationRow[]> {
  return d1All<ConversationRow>(
    env.DB,
    `SELECT * FROM ai_conversations WHERE created_by_id = ? ORDER BY updated_date DESC LIMIT ?`,
    userId,
    limit
  );
}

export async function getConversation(env: Env, userId: string, conversationId: string): Promise<ConversationRow | null> {
  const row = await d1First<ConversationRow>(env.DB, `SELECT * FROM ai_conversations WHERE id = ?`, conversationId);
  if (!row || row.created_by_id !== userId) return null;
  return row;
}

export async function listMessages(env: Env, conversationId: string): Promise<MessageRow[]> {
  return d1All<MessageRow>(
    env.DB,
    `SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_date ASC`,
    conversationId
  );
}

export async function appendMessage(
  env: Env,
  conversationId: string,
  userId: string,
  role: "user" | "assistant" | "system",
  content: string,
  contextSummary?: string
): Promise<MessageRow> {
  const id = ulid();
  const now = nowIso();
  await d1Run(
    env.DB,
    `INSERT INTO ai_messages (id, conversation_id, created_by_id, role, content, context_summary, created_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    conversationId,
    userId,
    role,
    content,
    contextSummary ?? null,
    now
  );
  await d1Run(env.DB, `UPDATE ai_conversations SET updated_date = ? WHERE id = ?`, now, conversationId);
  return { id, conversation_id: conversationId, created_by_id: userId, role, content, context_summary: contextSummary ?? null, created_date: now };
}

export async function deleteConversation(env: Env, userId: string, conversationId: string): Promise<boolean> {
  const conv = await getConversation(env, userId, conversationId);
  if (!conv) return false;
  await d1Run(env.DB, `DELETE FROM ai_messages WHERE conversation_id = ?`, conversationId);
  await d1Run(env.DB, `DELETE FROM ai_conversations WHERE id = ?`, conversationId);
  return true;
}

/** Converts stored message rows to the LLMMessage[] shape the provider expects (drops DB-only fields). */
export function toLLMHistory(messages: MessageRow[]): LLMMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}
