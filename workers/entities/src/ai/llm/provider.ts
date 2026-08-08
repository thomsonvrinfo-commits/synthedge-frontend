// LLM provider abstraction.
//
// Nothing outside this folder should import a provider-specific client
// directly — handlers/ai.ts and ai/coach.ts only ever see this interface,
// so switching providers (or supporting several) never touches routing,
// context building, or prompt construction.

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMChatOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  readonly name: string;
  /**
   * Streams the assistant's reply as it's generated. Implementations
   * should yield incremental text deltas (not full-message-so-far) so the
   * caller can forward them straight to an SSE response.
   */
  streamChat(messages: LLMMessage[], opts?: LLMChatOptions): AsyncGenerator<string, void, unknown>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "LLMError";
  }
}
