// ============================================================================
//  AnthropicChatLLM — tool-calling nativo do Claude (Etapa 17)
// ============================================================================
//
//  O tool-use da Anthropic NÃO é igual ao da OpenAI. Diferenças que tratamos aqui:
//    • system é um CAMPO próprio (não uma mensagem).
//    • um pedido de tool vem como bloco {type:'tool_use', id, name, input(objeto)}
//      dentro de uma mensagem 'assistant'.
//    • o RESULTADO de uma tool vai numa mensagem 'user' com bloco
//      {type:'tool_result', tool_use_id, content}. Resultados consecutivos são
//      AGRUPADOS numa única mensagem user (a API espera assim).
//    • as tools usam `input_schema` (o nosso ToolSpec.parameters).
//  Fonte: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
//
//  Implementa o MESMO ToolCallingLLMPort → o MentorAgent não sabe a diferença.
// ============================================================================

import type { ChatMessage, ChatResult, ToolCall, ToolSpec } from '../core/models.ts';
import type { ToolCallingLLMPort } from '../core/ports.ts';

const DEFAULT_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicChatConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly retries?: number;
}

interface Block {
  type: string;
  [k: string]: unknown;
}

export class AnthropicChatLLM implements ToolCallingLLMPort {
  private readonly apiKey: string;
  private readonly url: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(config: AnthropicChatConfig) {
    if (!config.apiKey) throw new Error('AnthropicChatLLM: apiKey vazia (defina ANTHROPIC_API_KEY).');
    if (!config.model) throw new Error('AnthropicChatLLM: model vazio.');
    this.apiKey = config.apiKey;
    this.url = config.baseUrl ?? DEFAULT_URL;
    this.model = config.model;
    this.maxTokens = config.maxTokens ?? 1024;
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
      `Falha de rede ao chamar a Anthropic após ${this.retries + 1} tentativas: ` +
        `${descreverErro(ultimoErro)}. Verifique sua conexão.`,
    );
  }

  private async callOnce(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatResult> {
    const { system, msgs } = toAnthropic(messages);
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
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          ...(system ? { system } : {}),
          messages: msgs,
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters,
          })),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detalhe = await response.text().catch(() => '');
        throw new HttpError(response.status, `Anthropic respondeu ${response.status}: ${detalhe}`);
      }
      const data = (await response.json()) as { content?: Block[] };
      let content = '';
      const toolCalls: ToolCall[] = [];
      for (const block of data.content ?? []) {
        if (block.type === 'text' && typeof block.text === 'string') {
          content += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: String(block.id),
            name: String(block.name),
            arguments: JSON.stringify(block.input ?? {}),
          });
        }
      }
      return { content, toolCalls };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Converte nossas ChatMessage no formato da Messages API (system + messages). */
function toAnthropic(messages: ChatMessage[]): { system: string; msgs: Record<string, unknown>[] } {
  let system = '';
  const msgs: Record<string, unknown>[] = [];
  let pendingToolResults: Block[] | null = null;

  const flush = () => {
    if (pendingToolResults) {
      msgs.push({ role: 'user', content: pendingToolResults });
      pendingToolResults = null;
    }
  };

  for (const m of messages) {
    if (m.role === 'system') {
      system += (system ? '\n' : '') + m.content;
      continue;
    }
    if (m.role === 'tool') {
      // Agrupa resultados de tools consecutivos numa única mensagem 'user'.
      pendingToolResults ??= [];
      pendingToolResults.push({ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content });
      continue;
    }
    flush();
    if (m.role === 'user') {
      msgs.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      if (m.toolCalls && m.toolCalls.length > 0) {
        const blocks: Block[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const tc of m.toolCalls) {
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: safeParse(tc.arguments) });
        }
        msgs.push({ role: 'assistant', content: blocks });
      } else {
        msgs.push({ role: 'assistant', content: m.content });
      }
    }
  }
  flush();
  return { system, msgs };
}

function safeParse(json: string): unknown {
  try {
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
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
