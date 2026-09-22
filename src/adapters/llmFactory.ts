// ============================================================================
//  llmFactory — LLM provider SELECTOR (Step 16, multi-provider)
// ============================================================================
//
//  A single place that decides WHICH LLM adapter to use, based on the chosen
//  provider. They all implement the same LLMPort → the rest of the system doesn't
//  change. It's the Strategy/Factory pattern: the strategy (provider) choice is isolated.
//
//  Providers:
//    • openrouter → OpenRouterLLM (gateway; auto-heal of :free models)
//    • openai     → OpenAICompatibleLLM (api.openai.com)
//    • gemini     → OpenAICompatibleLLM (Google's OpenAI-compatibility endpoint)
//    • anthropic  → AnthropicLLM (native Messages API)
//
//  `createLLM` is pure (takes explicit config → easy to test). `resolveProviderFromEnv`
//  is the thin shell that reads the environment variables and validates the key.
// ============================================================================

import type { LLMPort, ToolCallingLLMPort } from '../core/ports.ts';
import { OpenRouterLLM } from './openRouterLLM.ts';
import { OpenAICompatibleLLM } from './openAICompatibleLLM.ts';
import { AnthropicLLM } from './anthropicLLM.ts';
import { OpenRouterChatLLM } from './openRouterChatLLM.ts';
import { OpenAICompatibleChatLLM } from './openAICompatibleChatLLM.ts';
import { AnthropicChatLLM } from './anthropicChatLLM.ts';

export type LLMProvider = 'openrouter' | 'openai' | 'anthropic' | 'gemini';

export interface LLMFactoryConfig {
  readonly provider: LLMProvider;
  readonly apiKey: string;
  readonly model?: string; // if omitted, uses a per-provider default (see below)
  readonly timeoutMs?: number;
  readonly retries?: number;
}

// Per-provider defaults. Just a starting point — change with LLM_MODEL anytime
// (model names change over time).
const DEFAULT_MODEL: Record<LLMProvider, string> = {
  openrouter: 'openrouter/free',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-3-5-sonnet-latest',
};

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

/** Creates the right LLM (generate) adapter for the provider. Pure (no env reading). */
export function createLLM(cfg: LLMFactoryConfig): LLMPort {
  const model = cfg.model || DEFAULT_MODEL[cfg.provider];
  const timeoutMs = cfg.timeoutMs;
  const retries = cfg.retries;

  switch (cfg.provider) {
    case 'openrouter':
      return new OpenRouterLLM({ apiKey: cfg.apiKey, model, timeoutMs, retries });
    case 'openai':
      return new OpenAICompatibleLLM({
        apiKey: cfg.apiKey, model, baseUrl: OPENAI_URL, providerName: 'OpenAI', timeoutMs, retries,
      });
    case 'gemini':
      return new OpenAICompatibleLLM({
        apiKey: cfg.apiKey, model, baseUrl: GEMINI_URL, providerName: 'Gemini', timeoutMs, retries,
      });
    case 'anthropic':
      return new AnthropicLLM({ apiKey: cfg.apiKey, model, timeoutMs, retries });
    default: {
      // Exhaustiveness: if a new provider enters the type and we forget it here, TS flags it.
      const _never: never = cfg.provider;
      throw new Error(`Unknown LLM provider: ${String(_never)}`);
    }
  }
}

/**
 * Creates the right TOOL-CALLING (chat) adapter for the provider (Step 17) — used
 * by the agent. Pure (no env reading). ⚠️ The model must support tool-calling.
 */
export function createChatLLM(cfg: LLMFactoryConfig): ToolCallingLLMPort {
  const model = cfg.model || DEFAULT_MODEL[cfg.provider];
  const { timeoutMs, retries } = cfg;
  switch (cfg.provider) {
    case 'openrouter':
      return new OpenRouterChatLLM({ apiKey: cfg.apiKey, model, timeoutMs, retries });
    case 'openai':
      return new OpenAICompatibleChatLLM({
        apiKey: cfg.apiKey, model, baseUrl: OPENAI_URL, providerName: 'OpenAI', timeoutMs, retries,
      });
    case 'gemini':
      return new OpenAICompatibleChatLLM({
        apiKey: cfg.apiKey, model, baseUrl: GEMINI_URL, providerName: 'Gemini', timeoutMs, retries,
      });
    case 'anthropic':
      return new AnthropicChatLLM({ apiKey: cfg.apiKey, model, timeoutMs, retries });
    default: {
      const _never: never = cfg.provider;
      throw new Error(`Unknown LLM provider: ${String(_never)}`);
    }
  }
}

/** Which environment variable holds each provider's key. */
const KEY_ENV: Record<LLMProvider, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

const PROVIDER_KEYS_URL: Record<LLMProvider, string> = {
  openrouter: 'https://openrouter.ai/keys',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
};

/**
 * Reads LLM_PROVIDER + the key/model from the environment and VALIDATES the key
 * (secret guard) with a clear message pointing to the right env. Shared by both factories.
 */
export function resolveProviderFromEnv(): { provider: LLMProvider; apiKey: string; model?: string } {
  const provider = (process.env.LLM_PROVIDER ?? 'openrouter') as LLMProvider;
  if (!(provider in KEY_ENV)) {
    throw new Error(
      `Invalid LLM_PROVIDER: "${provider}". Use: openrouter | openai | anthropic | gemini.`,
    );
  }
  const keyEnv = KEY_ENV[provider];
  const apiKey = process.env[keyEnv] ?? '';
  if (!apiKey || apiKey.includes('cole-sua-chave') || apiKey.trim().length < 12) {
    throw new Error(
      `${keyEnv} is missing or looks like a placeholder (provider "${provider}"). ` +
        `Set your real key in .env (create one at ${PROVIDER_KEYS_URL[provider]}). Never commit the key.`,
    );
  }
  // LLM_MODEL is generic; for compatibility, OPENROUTER_MODEL still works for openrouter.
  const model =
    process.env.LLM_MODEL ?? (provider === 'openrouter' ? process.env.OPENROUTER_MODEL : undefined);
  return { provider, apiKey, model };
}

/** Reads the env and returns the ready LLM (generate). */
export function createLLMFromEnv(timeoutMs?: number): { llm: LLMPort; provider: LLMProvider; model: string } {
  const { provider, apiKey, model } = resolveProviderFromEnv();
  const llm = createLLM({ provider, apiKey, model, timeoutMs });
  return { llm, provider, model: model || DEFAULT_MODEL[provider] };
}

/** Reads the env and returns the ready TOOL-CALLING (chat) LLM — used by the agent (Step 17). */
export function createChatLLMFromEnv(timeoutMs?: number): {
  llm: ToolCallingLLMPort;
  provider: LLMProvider;
  model: string;
} {
  const { provider, apiKey, model } = resolveProviderFromEnv();
  const llm = createChatLLM({ provider, apiKey, model, timeoutMs });
  return { llm, provider, model: model || DEFAULT_MODEL[provider] };
}
