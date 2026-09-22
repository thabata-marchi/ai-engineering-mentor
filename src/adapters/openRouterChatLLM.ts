// ============================================================================
//  OpenRouterChatLLM — LLM with TOOL-CALLING (implements ToolCallingLLMPort)
// ============================================================================
//
//  Sibling of OpenRouterLLM, but for the AGENT (Step 11). The difference: besides
//  the messages, we send the LIST OF TOOLS (in the OpenAI format) and read back the
//  `tool_calls` — the model's requests to execute a tool.
//
//  OpenRouter's API is compatible with OpenAI's, which accepts:
//    body: { model, messages, tools, tool_choice }
//  and replies with choices[0].message.tool_calls when the model wants to act.
//  Source: https://openrouter.ai/docs/features/tool-calling
//
//  ⚠️ NOT every :free model supports tool-calling reliably. If the model ignores the
//  tools, the agent simply gets a final text (no tool_calls) — the issue is VISIBLE,
//  not silent. Prefer "instruct" models that advertise tool support. See the README.
//
//  We keep the same robustness as OpenRouterLLM: timeout (AbortController), network
//  retry with backoff and AUTO-HEAL (404 on free → falls back to the auto-router).
// ============================================================================

import type { ChatMessage, ChatResult, ToolCall, ToolSpec } from '../core/models.ts';
import type { ToolCallingLLMPort } from '../core/ports.ts';

export interface OpenRouterChatConfig {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly retries?: number;
}

const DEFAULT_MODEL = 'openrouter/free';
const FALLBACK_MODEL = 'openrouter/free';
const DEFAULT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class OpenRouterChatLLM implements ToolCallingLLMPort {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(config: OpenRouterChatConfig) {
    if (!config.apiKey) {
      throw new Error(
        'OpenRouterChatLLM: empty apiKey. Set OPENROUTER_API_KEY (create one at https://openrouter.ai/keys).',
      );
    }
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.url = config.baseUrl ?? DEFAULT_URL;
    this.timeoutMs = config.timeoutMs ?? 120_000;
    this.retries = config.retries ?? 2;
  }

  async chat(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatResult> {
    try {
      return await this.attempt(messages, tools, this.model);
    } catch (err) {
      const rotated =
        err instanceof HttpError && err.status === 404 && this.model !== FALLBACK_MODEL;
      if (rotated) {
        console.warn(
          `⚠️  Model "${this.model}" unavailable on the free tier. Using "${FALLBACK_MODEL}"...`,
        );
        return await this.attempt(messages, tools, FALLBACK_MODEL);
      }
      throw err;
    }
  }

  /** Tries with a specific model, with network retry and timeout. */
  private async attempt(
    messages: ChatMessage[],
    tools: ToolSpec[],
    model: string,
  ): Promise<ChatResult> {
    let lastError: unknown;
    for (let i = 0; i <= this.retries; i++) {
      try {
        return await this.callOnce(messages, tools, model);
      } catch (err) {
        if (err instanceof HttpError) throw err; // server error → don't retry
        lastError = err;
        if (i < this.retries) await sleep(500 * (i + 1));
      }
    }
    throw new Error(
      `Network failure calling OpenRouter after ${this.retries + 1} attempts: ` +
        `${describeError(lastError)}. Check your connection.`,
    );
  }

  /** One attempt: builds the request (with tools), with a timeout, and reads the tool_calls. */
  private async callOnce(
    messages: ChatMessage[],
    tools: ToolSpec[],
    model: string,
  ): Promise<ChatResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: messages.map(toApiMessage),
          // Describes the tools in the format OpenAI/OpenRouter expects.
          tools: tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new HttpError(response.status, detail);
      }

      const data = (await response.json()) as {
        choices?: {
          message?: {
            content?: string | null;
            tool_calls?: { id: string; function: { name: string; arguments: string } }[];
          };
        }[];
      };
      const msg = data.choices?.[0]?.message;
      const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments ?? '{}',
      }));
      return { content: msg?.content ?? '', toolCalls };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Translates our ChatMessage into the exact format the API expects. */
function toApiMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    // A message with the RESULT of a tool: it must tie to the request (tool_call_id).
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  }
  if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
    // The assistant REQUESTING tools: we resend the tool_calls in the API format.
    return {
      role: 'assistant',
      content: m.content || null,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
  }
  return { role: m.role, content: m.content };
}

/** Error from the server (HTTP status). Should not be retried. */
class HttpError extends Error {
  readonly status: number;
  readonly detail: string;
  constructor(status: number, detail: string) {
    super(`OpenRouter responded ${status}: ${detail}`);
    this.name = 'HttpError';
    this.status = status;
    this.detail = detail;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: { message?: string } }).cause;
    return cause?.message ? `${err.message} (${cause.message})` : err.message;
  }
  return String(err);
}
