// ============================================================================
//  AnthropicLLM — adapter nativo do Claude (Etapa 16, multi-provedor)
// ============================================================================
//
//  Diferente do OpenAI/Gemini, a Anthropic NÃO é compatível com a API da OpenAI.
//  Ela usa a "Messages API":
//    POST https://api.anthropic.com/v1/messages
//    headers: x-api-key: <CHAVE>, anthropic-version: 2023-06-01
//    body: { model, max_tokens, system, messages: [{ role:'user', content }] }
//    resposta: content[0].text
//  Fonte: https://docs.anthropic.com/en/api/messages
//
//  Por isso é um adapter SEPARADO — mas implementa o MESMO LLMPort, então o resto
//  do sistema (RAG, MCP) não sabe a diferença. É o "L"/"D" do SOLID na prática:
//  trocar o provedor não muda o núcleo.
// ============================================================================

import type { LLMPort } from '../core/ports.ts';

const DEFAULT_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicConfig {
  readonly apiKey: string;
  readonly model: string; // ex.: claude-3-5-sonnet-latest
  readonly baseUrl?: string;
  readonly maxTokens?: number; // obrigatório na API; padrão 1024
  readonly timeoutMs?: number;
  readonly retries?: number;
}

export class AnthropicLLM implements LLMPort {
  private readonly apiKey: string;
  private readonly url: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(config: AnthropicConfig) {
    if (!config.apiKey) throw new Error('AnthropicLLM: apiKey vazia (defina ANTHROPIC_API_KEY).');
    if (!config.model) throw new Error('AnthropicLLM: model vazio.');
    this.apiKey = config.apiKey;
    this.url = config.baseUrl ?? DEFAULT_URL;
    this.model = config.model;
    this.maxTokens = config.maxTokens ?? 1024;
    this.timeoutMs = config.timeoutMs ?? 120_000;
    this.retries = config.retries ?? 2;
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa <= this.retries; tentativa++) {
      try {
        return await this.callOnce(systemPrompt, userPrompt);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        ultimoErro = err;
        if (tentativa < this.retries) await sleep(500 * (tentativa + 1));
      }
    }
    throw new Error(
      `Falha de rede ao chamar a Anthropic após ${this.retries + 1} tentativas: ` +
        `${descreverErro(ultimoErro)}. Verifique sua conexão.`,
    );
  }

  private async callOnce(systemPrompt: string, userPrompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'Content-Type': 'application/json',
        },
        // Na Messages API, o system prompt é um CAMPO próprio (não uma mensagem).
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detalhe = await response.text().catch(() => '');
        throw new HttpError(response.status, `Anthropic respondeu ${response.status}: ${detalhe}`);
      }
      const data = (await response.json()) as { content?: { type: string; text?: string }[] };
      const text = data.content?.find((c) => c.type === 'text')?.text;
      if (typeof text !== 'string') {
        throw new HttpError(200, 'Anthropic: resposta sem conteúdo de texto.');
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
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
