// ============================================================================
//  OpenAICompatibleLLM — cliente genérico p/ APIs compatíveis com a OpenAI
// ============================================================================
//
//  Etapa 16 (multi-provedor). Vários provedores expõem o MESMO formato de API da
//  OpenAI (`POST /chat/completions`, body `{model, messages}`, resposta em
//  `choices[0].message.content`). Então UM adapter serve todos, mudando só:
//    • baseUrl  (para onde vai a requisição)
//    • apiKey   (a chave do provedor)
//    • model    (o modelo escolhido)
//
//  Provedores cobertos por este adapter: OpenAI e Google Gemini (endpoint de
//  compatibilidade OpenAI). O OpenRouter tem o seu próprio adapter (com auto-cura
//  de modelos :free), e a Anthropic tem outro (API diferente).
//
//  É o mesmo padrão do OpenRouterLLM (timeout via AbortController + retry de rede),
//  só que SEM a auto-cura específica do OpenRouter e com baseUrl configurável.
// ============================================================================

import type { LLMPort } from '../core/ports.ts';

export interface OpenAICompatibleConfig {
  readonly apiKey: string;
  readonly baseUrl: string; // ex.: https://api.openai.com/v1/chat/completions
  readonly model: string; // ex.: gpt-4o-mini
  readonly providerName?: string; // rótulo p/ mensagens de erro (ex.: "OpenAI")
  readonly timeoutMs?: number;
  readonly retries?: number;
}

export class OpenAICompatibleLLM implements LLMPort {
  private readonly apiKey: string;
  private readonly url: string;
  private readonly model: string;
  private readonly provider: string;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(config: OpenAICompatibleConfig) {
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

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa <= this.retries; tentativa++) {
      try {
        return await this.callOnce(systemPrompt, userPrompt);
      } catch (err) {
        if (err instanceof HttpError) throw err; // erro do servidor → não retenta
        ultimoErro = err;
        if (tentativa < this.retries) await sleep(500 * (tentativa + 1));
      }
    }
    throw new Error(
      `Falha de rede ao chamar ${this.provider} após ${this.retries + 1} tentativas: ` +
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
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detalhe = await response.text().catch(() => '');
        throw new HttpError(response.status, `${this.provider} respondeu ${response.status}: ${detalhe}`);
      }
      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== 'string') {
        throw new HttpError(200, `${this.provider}: resposta sem conteúdo de texto.`);
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
