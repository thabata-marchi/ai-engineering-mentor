// ============================================================================
//  llmFactory — SELETOR de provedor de LLM (Etapa 16, multi-provedor)
// ============================================================================
//
//  Um único lugar que decide QUAL adapter de LLM usar, conforme o provedor
//  escolhido. Todos implementam o mesmo LLMPort → o resto do sistema não muda.
//  É o padrão Strategy/Factory: a escolha da estratégia (provedor) fica isolada.
//
//  Provedores:
//    • openrouter → OpenRouterLLM (gateway; auto-cura de modelos :free)
//    • openai     → OpenAICompatibleLLM (api.openai.com)
//    • gemini     → OpenAICompatibleLLM (endpoint de compatibilidade OpenAI do Google)
//    • anthropic  → AnthropicLLM (Messages API nativa)
//
//  `createLLM` é puro (recebe config explícita → fácil de testar). `resolveFromEnv`
//  é a casca fininha que lê as variáveis de ambiente e valida a chave.
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
  readonly model?: string; // se omitido, usa um padrão por provedor (veja abaixo)
  readonly timeoutMs?: number;
  readonly retries?: number;
}

// Padrões por provedor. São só um ponto de partida — troque com LLM_MODEL a
// qualquer momento (os nomes de modelo mudam com o tempo).
const DEFAULT_MODEL: Record<LLMProvider, string> = {
  openrouter: 'openrouter/free',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-3-5-sonnet-latest',
};

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

/** Cria o adapter de LLM (generate) certo para o provedor. Puro (sem ler env). */
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
      // Exaustividade: se um provedor novo entrar no tipo e esquecermos aqui, o TS acusa.
      const _never: never = cfg.provider;
      throw new Error(`Provedor de LLM desconhecido: ${String(_never)}`);
    }
  }
}

/**
 * Cria o adapter de TOOL-CALLING (chat) certo para o provedor (Etapa 17) — usado
 * pelo agente. Puro (sem ler env). ⚠️ O modelo precisa suportar tool-calling.
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
      throw new Error(`Provedor de LLM desconhecido: ${String(_never)}`);
    }
  }
}

/** Qual variável de ambiente guarda a chave de cada provedor. */
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
 * Lê LLM_PROVIDER + a chave/modelo do ambiente e VALIDA a chave (guard de segredo)
 * com mensagem clara apontando a env certa. Compartilhado pelos dois factories.
 */
export function resolveProviderFromEnv(): { provider: LLMProvider; apiKey: string; model?: string } {
  const provider = (process.env.LLM_PROVIDER ?? 'openrouter') as LLMProvider;
  if (!(provider in KEY_ENV)) {
    throw new Error(
      `LLM_PROVIDER inválido: "${provider}". Use: openrouter | openai | anthropic | gemini.`,
    );
  }
  const keyEnv = KEY_ENV[provider];
  const apiKey = process.env[keyEnv] ?? '';
  if (!apiKey || apiKey.includes('cole-sua-chave') || apiKey.trim().length < 12) {
    throw new Error(
      `${keyEnv} ausente ou parece um placeholder (provedor "${provider}"). ` +
        `Defina no .env a sua chave real (crie em ${PROVIDER_KEYS_URL[provider]}). Nunca comite a chave.`,
    );
  }
  // LLM_MODEL é genérico; p/ compatibilidade, OPENROUTER_MODEL ainda vale no openrouter.
  const model =
    process.env.LLM_MODEL ?? (provider === 'openrouter' ? process.env.OPENROUTER_MODEL : undefined);
  return { provider, apiKey, model };
}

/** Lê o env e devolve o LLM (generate) pronto. */
export function createLLMFromEnv(timeoutMs?: number): { llm: LLMPort; provider: LLMProvider; model: string } {
  const { provider, apiKey, model } = resolveProviderFromEnv();
  const llm = createLLM({ provider, apiKey, model, timeoutMs });
  return { llm, provider, model: model || DEFAULT_MODEL[provider] };
}

/** Lê o env e devolve o LLM de TOOL-CALLING (chat) pronto — usado pelo agente (Etapa 17). */
export function createChatLLMFromEnv(timeoutMs?: number): {
  llm: ToolCallingLLMPort;
  provider: LLMProvider;
  model: string;
} {
  const { provider, apiKey, model } = resolveProviderFromEnv();
  const llm = createChatLLM({ provider, apiKey, model, timeoutMs });
  return { llm, provider, model: model || DEFAULT_MODEL[provider] };
}
