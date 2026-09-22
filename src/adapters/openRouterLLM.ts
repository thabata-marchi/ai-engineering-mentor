// ============================================================================
//  OpenRouterLLM — REAL LLM adapter (implements LLMPort via OpenRouter)
// ============================================================================
//
//  WHAT IS OPENROUTER (and why it)?
//  It's a "gateway": a single API and a single key give access to dozens of models
//  (OpenAI, Google, Meta, Mistral, Qwen...). Several models have a FREE version (id
//  ends in ":free") — great for study.
//  Sources: https://openrouter.ai/docs/quickstart and https://openrouter.ai/openrouter/free
//
//  THE API IS COMPATIBLE WITH OPENAI'S:
//    POST https://openrouter.ai/api/v1/chat/completions
//    Header: Authorization: Bearer <YOUR_KEY>
//    Body: { model, messages: [{ role, content }, ...] }
//
//  ARCHITECTURE DECISION:
//  This is just another ADAPTER that honors `LLMPort`. The use case (AnswerQuestion)
//  changes NOTHING to use it in place of FakeLLM — again, the "D" of SOLID. The API
//  key is RECEIVED ready (injection), not read here inside: so the adapter doesn't
//  know about environment variables and stays testable.
//
//  THE SECRET NEVER GOES INTO THE CODE:
//  The key comes from an environment variable (OPENROUTER_API_KEY), read at the
//  "composition root" (examples/setup.ts) and passed here. We never commit a key.
// ============================================================================

import type { LLMPort } from '../core/ports.ts';

export interface OpenRouterConfig {
  readonly apiKey: string;
  readonly model?: string; // default: a free model
  readonly baseUrl?: string; // allows swapping the URL in tests
  readonly timeoutMs?: number; // cuts the wait if the server hangs (default 60s)
  readonly retries?: number; // extra attempts on network failure (default 2)
}

// Default model: "openrouter/free" is the free AUTO-ROUTER — OpenRouter itself picks
// an active :free model on the fly. Since :free models ROTATE (disappear without
// notice), the auto-router prevents the app from breaking. To pin a specific model,
// pass OPENROUTER_MODEL (see https://openrouter.ai/models, filter "free").
const DEFAULT_MODEL = 'openrouter/free';
// Safety net: if the chosen model rotates to paid (404), we automatically fall back
// to the free auto-router.
const FALLBACK_MODEL = 'openrouter/free';
const DEFAULT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class OpenRouterLLM implements LLMPort {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(config: OpenRouterConfig) {
    if (!config.apiKey) {
      throw new Error(
        'OpenRouterLLM: empty apiKey. Set OPENROUTER_API_KEY (create one at https://openrouter.ai/keys).',
      );
    }
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.url = config.baseUrl ?? DEFAULT_URL;
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.retries = config.retries ?? 2;
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      return await this.attempt(systemPrompt, userPrompt, this.model);
    } catch (err) {
      // AUTO-HEAL: if the chosen model left the free tier (404), the app doesn't
      // break — it automatically falls back to the free auto-router, which always
      // has some active model. This avoids editing the .env every time a ":free"
      // model rotates to paid.
      const rotated =
        err instanceof HttpError && err.status === 404 && this.model !== FALLBACK_MODEL;
      if (rotated) {
        console.warn(
          `⚠️  Model "${this.model}" unavailable on the free tier. Using "${FALLBACK_MODEL}"...`,
        );
        return await this.attempt(systemPrompt, userPrompt, FALLBACK_MODEL);
      }
      throw err;
    }
  }

  /** Tries to generate with a specific model, with network retry and timeout. */
  private async attempt(
    systemPrompt: string,
    userPrompt: string,
    model: string,
  ): Promise<string> {
    // Try a few times: NETWORK failures (the "fetch failed") are usually transient.
    // HTTP errors (4xx) are NOT retried — insisting won't help. Simple backoff: wait
    // a bit longer on each attempt.
    let lastError: unknown;
    for (let i = 0; i <= this.retries; i++) {
      try {
        return await this.callOnce(systemPrompt, userPrompt, model);
      } catch (err) {
        if (err instanceof HttpError) throw err; // server error → don't retry
        lastError = err;
        if (i < this.retries) {
          await sleep(500 * (i + 1)); // 0.5s, 1s, ...
        }
      }
    }
    throw new Error(
      `Network failure calling OpenRouter after ${this.retries + 1} attempts: ` +
        `${describeError(lastError)}. Check your connection.`,
    );
  }

  /** One attempt: builds the request, with a timeout, and reads the response. */
  private async callOnce(
    systemPrompt: string,
    userPrompt: string,
    model: string,
  ): Promise<string> {
    // AbortController cuts the request if it exceeds the time limit.
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
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      // HTTP error (invalid key, limit, model gone...) → clear message.
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new HttpError(response.status, detail);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== 'string') {
        throw new HttpError(200, 'response without text content.');
      }
      return text;
    } finally {
      clearTimeout(timer); // always clear the timer (success or not)
    }
  }
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

/** Extracts a useful description from the network error (the "fetch failed" hides the cause). */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: { message?: string } }).cause;
    return cause?.message ? `${err.message} (${cause.message})` : err.message;
  }
  return String(err);
}
