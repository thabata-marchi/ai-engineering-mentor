// ============================================================================
//  OpenRouterLLM — adapter de LLM REAL (implementa LLMPort via OpenRouter)
// ============================================================================
//
//  O QUE É O OPENROUTER (e por que ele)?
//  É um "gateway": uma única API e uma única chave dão acesso a dezenas de
//  modelos (OpenAI, Google, Meta, Mistral, Qwen...). O curso do Erick usa ele,
//  então mantemos o alinhamento. Vários modelos têm versão GRATUITA (id termina
//  em ":free") — ótimo para estudo.
//  Fontes: https://openrouter.ai/docs/quickstart e https://openrouter.ai/openrouter/free
//
//  A API é COMPATÍVEL COM A DA OPENAI:
//    POST https://openrouter.ai/api/v1/chat/completions
//    Header: Authorization: Bearer <SUA_CHAVE>
//    Body: { model, messages: [{ role, content }, ...] }
//
//  DECISÃO DE ARQUITETURA:
//  Este é só mais um ADAPTER que respeita o `LLMPort`. O caso de uso
//  (AnswerQuestion) não muda NADA para usá-lo no lugar do FakeLLM — de novo, o
//  "D" do SOLID. A chave da API é RECEBIDA pronta (injeção), não lida aqui
//  dentro: assim o adapter não conhece variáveis de ambiente e fica testável.
//
//  SEGREDO NUNCA VAI PARA O CÓDIGO:
//  A chave vem de uma variável de ambiente (OPENROUTER_API_KEY), lida lá no
//  "ponto de montagem" (examples/ask.ts) e passada aqui. Nunca commitamos chave.
// ============================================================================

import type { LLMPort } from '../core/ports.ts';

export interface OpenRouterConfig {
  readonly apiKey: string;
  readonly model?: string; // padrão: um modelo gratuito
  readonly baseUrl?: string; // permite trocar a URL nos testes
}

// Modelo padrão: "openrouter/free" é o AUTO-ROUTER de gratuitos — o próprio
// OpenRouter escolhe um modelo :free ativo na hora. Como os :free ROTACIONAM
// (somem sem aviso), o auto-router evita que o app quebre. Para fixar um modelo
// específico, passe OPENROUTER_MODEL (veja https://openrouter.ai/models, filtro "free").
const DEFAULT_MODEL = 'openrouter/free';
const DEFAULT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class OpenRouterLLM implements LLMPort {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly url: string;

  constructor(config: OpenRouterConfig) {
    if (!config.apiKey) {
      throw new Error(
        'OpenRouterLLM: apiKey vazia. Defina OPENROUTER_API_KEY (crie em https://openrouter.ai/keys).',
      );
    }
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.url = config.baseUrl ?? DEFAULT_URL;
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    // fetch é global no Node 22+ (não precisa de biblioteca).
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
    });

    // Falhar com mensagem clara (chave inválida, limite de uso, modelo fora...).
    if (!response.ok) {
      const detalhe = await response.text().catch(() => '');
      throw new Error(`OpenRouter respondeu ${response.status}: ${detalhe}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new Error('OpenRouter: resposta sem conteúdo de texto.');
    }
    return text;
  }
}
