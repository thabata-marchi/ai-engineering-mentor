// ============================================================================
//  RateLimited*LLM — DECORATORS que aplicam rate limit sem tocar no adapter real
// ============================================================================
//
//  PADRÃO DECORATOR: cada classe aqui "embrulha" outro LLM (o real) e adiciona um
//  comportamento — checar o limite — ANTES de delegar. Como o decorator implementa
//  o MESMO port, quem usa (AnswerQuestion, MentorAgent) não percebe diferença:
//  continua chamando `generate`/`chat`. É o Princípio Aberto/Fechado na prática —
//  estendemos o comportamento sem modificar o OpenRouterLLM.
//
//  Os dois compartilham o MESMO RateLimiter (do core), então o teto vale para o
//  conjunto de chamadas (RAG + agente) — protege sua cota de forma unificada.
// ============================================================================

import type { ChatMessage, ChatResult, ToolSpec } from '../core/models.ts';
import type { LLMPort, ToolCallingLLMPort } from '../core/ports.ts';
import type { RateLimiter } from '../core/rateLimiter.ts';

/** Decorator do LLMPort simples (usado pelo RAG). */
export class RateLimitedLLM implements LLMPort {
  private readonly inner: LLMPort;
  private readonly limiter: RateLimiter;

  constructor(inner: LLMPort, limiter: RateLimiter) {
    this.inner = inner;
    this.limiter = limiter;
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    this.limiter.acquire(); // lança RateLimitError se exceder
    return this.inner.generate(systemPrompt, userPrompt);
  }
}

/** Decorator do ToolCallingLLMPort (usado pelo agente). */
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
