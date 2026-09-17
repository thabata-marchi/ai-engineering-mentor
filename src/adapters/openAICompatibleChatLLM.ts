// ============================================================================
//  OpenAICompatibleChatLLM — tool-calling p/ APIs compatíveis com a OpenAI
// ============================================================================
//
//  Etapa 17 (tool-calling multi-provedor). Assim como no `generate`, o formato
//  de TOOL-CALLING da OpenAI é compartilhado por vários provedores (OpenAI,
//  Gemini via endpoint de compatibilidade, e o próprio OpenRouter). Então um
//  adapter genérico serve todos, mudando só baseUrl/chave/modelo.
//
//  É a mesma lógica do OpenRouterChatLLM (envia `tools`, lê `tool_calls`), sem a
//  auto-cura específica do OpenRouter e com baseUrl configurável.
// ============================================================================

import type { ChatMessage, ChatResult, ToolCall, ToolSpec } from '../core/models.ts';
import type { ToolCallingLLMPort } from '../core/ports.ts';

export interface OpenAICompatibleChatConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly providerName?: string;
  readonly timeoutMs?: number;
  readonly retries?: number;
}

export class OpenAICompatibleChatLLM implements ToolCallingLLMPort {
  private readonly apiKey: string;
  private readonly url: string;
  private readonly model: string;
  private readonly provider: string;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(config: OpenAICompatibleChatConfig) {
    if (!config.apiKey) throw new Error(`${config.providerName ?? 'LLM'}: apiKey vazia.`);
    if (!config.baseUrl) throw new Error(`${config.providerName ?? 'LLM'}: baseUrl vazia.`);
    if (!config.model) throw new Error(`${config.providerName ?? 'LLM'}: model vazio.`);
    this.apiKey = config.apiKey;
    this.url = config.baseUrl;
    this.model = config.model;
    this.provider = config.providerName ?? 'OpenAI-compatible';
    this.timeoutMs = config.timeoutMs ?? 120_000;
    this.retries = config.retries ?? 2;
  }

  async chat(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatResult> {
    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa <= this.retries; tentativa++) {
      try {
        return await this.callOnce(messages, tools);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        ultimoErro = err;
        if (tentativa < this.retries) await sleep(500 * (tentativa + 1));
      }
    }
    throw new Error(
      `Falha de rede ao chamar ${this.provider} após ${this.retries + 1} tentativas: ` +
        `${descreverErro(ultimoErro)}. Verifique sua conexão.`,
    );
  }

  private async callOnce(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map(toApiMessage),
          tools: tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detalhe = await response.text().catch(() => '');
        throw new HttpError(response.status, `${this.provider} respondeu ${response.status}: ${detalhe}`);
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

/** Traduz a nossa ChatMessage para o formato que a API OpenAI espera. */
function toApiMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  }
  if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
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

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function descreverErro(err: unknown): string {
  if (err instanceof Error) {
    const causa = (err as { cause?: { message?: string } }).cause;
    return causa?.message ? `${err.message} (${causa.message})` : err.message;
  }
  return String(err);
}
