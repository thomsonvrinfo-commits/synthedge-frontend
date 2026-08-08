// OpenAI provider implementation.
//
// IMPORTANT — cannot be live-tested from this environment: this sandbox's
// network egress allowlist does not include api.openai.com (confirmed: a
// direct request returns 403 from the egress proxy), and no OPENAI_API_KEY
// is available here even if it were reachable. Everything downstream of
// this file (context engine, prompt construction, conversation persistence,
// SSE plumbing, routing/authorization) is exercised by integration tests
// using a fake LLMProvider (see ai.integration.test.ts) — this file's own
// wire behavior needs a smoke test against a real OpenAI key post-deploy.

import type { LLMProvider, LLMMessage, LLMChatOptions } from "./provider";
import { LLMError } from "./provider";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini"; // cost-aware default; override via env.OPENAI_MODEL
const DEFAULT_MAX_TOKENS = 1000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(apiKey: string, body: Record<string, unknown>): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw new LLMError(`OpenAI request failed: ${e instanceof Error ? e.message : String(e)}`, "openai", true);
    }

    if (res.ok) return res;

    const isRetryable = RETRYABLE_STATUS.has(res.status);
    if (isRetryable && attempt < MAX_RETRIES) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }

    const text = await res.text().catch(() => "");
    throw new LLMError(`OpenAI ${res.status}: ${text.slice(0, 300)}`, "openai", isRetryable);
  }
  throw lastError instanceof Error
    ? new LLMError(lastError.message, "openai", true)
    : new LLMError("OpenAI request failed after retries", "openai", true);
}

/** Parses one SSE "data: {...}" line into a content delta, or null for non-content events. */
function parseSSELine(line: string): string | null {
  if (!line.startsWith("data:")) return null;
  const payload = line.slice(5).trim();
  if (payload === "[DONE]") return null;
  try {
    const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
    return parsed.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null; // partial/malformed line — tolerated, matches SSE's at-most-once-per-line contract
  }
}

export function createOpenAIProvider(apiKey: string, model = DEFAULT_MODEL): LLMProvider {
  return {
    name: "openai",
    async *streamChat(messages: LLMMessage[], opts?: LLMChatOptions) {
      const res = await requestWithRetry(apiKey, {
        model,
        messages,
        stream: true,
        max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: opts?.temperature ?? 0.4, // lower than default: a coach should be consistent, not creative
      });

      if (!res.body) throw new LLMError("OpenAI response had no body", "openai", false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // keep the last (possibly incomplete) line for the next chunk
          for (const line of lines) {
            const delta = parseSSELine(line);
            if (delta) yield delta;
          }
        }
        // Flush any trailing complete line without a final newline.
        const delta = parseSSELine(buffer);
        if (delta) yield delta;
      } finally {
        reader.releaseLock();
      }
    },
  };
}
