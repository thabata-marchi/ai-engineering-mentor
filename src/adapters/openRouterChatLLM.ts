// ============================================================================
//  OpenRouterChatLLM — LLM com TOOL-CALLING (implementa ToolCallingLLMPort)
// ============================================================================
//
//  Irmão do OpenRouterLLM, mas para o AGENTE (Etapa 11). A diferença: além das
//  mensagens, mandamos a LISTA DE TOOLS (no formato da OpenAI) e lemos de volta
//  os `tool_calls` — os pedidos do modelo para executar uma ferramenta.
//
//  A API do OpenRouter é compatível com a da OpenAI, que aceita:
//    body: { model, messages, tools, tool_choice }
//  e responde com choices[0].message.tool_calls quando o modelo quer agir.
//  Fonte: https://openrouter.ai/docs/features/tool-calling
//
//  ⚠️ NEM TODO modelo :free suporta tool-calling de forma confiável. Se o modelo
//  ignorar as tools, o agente simplesmente recebe um texto final (sem tool_calls)
//  — o erro fica VISÍVEL, não silencioso. Prefira modelos "instruct" que anunciam
//  suporte a tools (ex.: alguns Qwen/Llama). Veja o README da Etapa 11.
//
//  Mantemos a mesma robustez do OpenRouterLLM: timeout (AbortController), retry
//  de rede com backoff e AUTO-CURA (404 no gratuito → cai no auto-router).
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
        'OpenRouterChatLLM: apiKey vazia. Defina OPENROUTER_API_KEY (crie em https://openrouter.ai/keys).',
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
      const rotacionou =
        err instanceof HttpError && err.status === 404 && this.model !== FALLBACK_MODEL;
      if (rotacionou) {
        console.warn(
          `⚠️  Modelo "${this.model}" indisponível no gratuito. Usando "${FALLBACK_MODEL}"...`,
        );
        return await this.attempt(messages, tools, FALLBACK_MODEL);
      }
      throw err;
    }
  }

  /** Tenta com um modelo específico, com retry de rede e timeout. */
  private async attempt(
    messages: ChatMessage[],
    tools: ToolSpec[],
    model: string,
  ): Promise<ChatResult> {
    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa <= this.retries; tentativa++) {
      try {
        return await this.callOnce(messages, tools, model);
      } catch (err) {
        if (err instanceof HttpError) throw err; // erro do servidor → não retenta
        ultimoErro = err;
        if (tentativa < this.retries) await sleep(500 * (tentativa + 1));
      }
    }
    throw new Error(
      `Falha de rede ao chamar o OpenRouter após ${this.retries + 1} tentativas: ` +
        `${descreverErro(ultimoErro)}. Verifique sua conexão.`,
    );
  }

  /** Uma tentativa: monta a requisição (com tools), com timeout, e lê os tool_calls. */
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
          // Descreve as tools no formato que a OpenAI/OpenRouter espera.
          tools: tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detalhe = await response.text().catch(() => '');
        throw new HttpError(response.status, detalhe);
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

/** Traduz a nossa ChatMessage para o formato exato que a API espera. */
function toApiMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    // Mensagem com o RESULTADO de uma tool: precisa amarrar ao pedido (tool_call_id).
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  }
  if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
    // O assistant PEDINDO tools: reenviamos os tool_calls no formato da API.
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

/** Erro vindo do servidor (status HTTP). Não deve ser retentado. */
class HttpError extends Error {
  readonly status: number;
  readonly detalhe: string;
  constructor(status: number, detalhe: string) {
    super(`OpenRouter respondeu ${status}: ${detalhe}`);
    this.name = 'HttpError';
    this.status = status;
    this.detalhe = detalhe;
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
