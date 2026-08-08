-- Migration 0002: AI Trading Coach conversation persistence.
--
-- Every other context source the AI coach reads (trades, replay_sessions,
-- trading_rules, broker_trades, trader_profiles) already exists — see
-- workers/entities/src/ai/context.ts. This migration adds the one thing
-- that didn't: a place to durably store the chat transcript itself, so a
-- conversation survives a page refresh/new device, per-message role/content
-- for multi-turn context, and (for explainability, Phase 5) an optional
-- snapshot of which context was actually used for a given assistant reply.

CREATE TABLE ai_conversations (
  id              TEXT PRIMARY KEY,
  created_by_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT,
  created_date    TEXT NOT NULL,
  updated_date    TEXT NOT NULL
);

CREATE INDEX idx_ai_conversations_user ON ai_conversations(created_by_id, updated_date DESC);

CREATE TABLE ai_messages (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  created_by_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT NOT NULL,
  -- JSON snapshot of what context the coach actually used to answer this
  -- turn (assistant messages only) -- powers "what data supports this"
  -- explainability without re-deriving it after the fact.
  context_summary   TEXT,
  created_date      TEXT NOT NULL
);

CREATE INDEX idx_ai_messages_conversation ON ai_messages(conversation_id, created_date ASC);
