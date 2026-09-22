// ============================================================================
//  RateLimited*LLM — DECORATORS that apply the rate limit without touching the real adapter
// ============================================================================
//
//  DECORATOR PATTERN: each class here "wraps" another LLM (the real one) and adds a
//  behavior — checking the limit — BEFORE delegating. Since the decorator implements
//  the SAME port, its users (AnswerQuestion, MentorAgent) notice no difference: they
//  keep calling `generate`/`chat`. It's the Open/Closed Principle in practice — we
//  extend the behavior without modifying OpenRouterLLM.
//
//  Both share the SAME RateLimiter (from the core), so the cap applies to the whole
//  set of calls (RAG + agent) — protecting your quota in a unified way.
// ============================================================================

import type { ChatMessage, ChatResult, ToolSpec } from '../core/models.ts';
import type { LLMPort, ToolCallingLLMPort } from '../core/ports.ts';
import type { RateLimiter } from '../core/rateLimiter.ts';

/** Decorator of the simple LLMPort (used by the RAG). */
export class RateLimitedLLM implements LLMPort {
  private readonly inner: LLMPort;
  private readonly limiter: RateLimiter;

  constructor(inner: LLMPort, limiter: RateLimiter) {
    this.inner = inner;
    this.limiter = limiter;
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    this.limiter.acquire(); // throws RateLimitError if exceeded
    return this.inner.generate(systemPrompt, userPrompt);
  }
}

/** Decorator of the ToolCallingLLMPort (used by the agent). */
export class RateLimitedChatLLM implements ToolCallingLLMPort {
  private readonly inner: ToolCallingLLMPort;
  private readonly limiter: RateLimiter;

  constructor(inner: ToolCallingLLMPort, limiter: RateLimiter) {
    this.inner = inner;
    this.limiter = limiter;
  }

  async chat(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatResult> {
    this.limiter.acquire();
    return this.inner.chat(messages, tools);
  }
}
