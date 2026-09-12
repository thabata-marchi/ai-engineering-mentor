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
  readonly timeoutMs?: number; // corta a espera se o servidor travar (padrão 60s)
  readonly retries?: number; // tentativas extras em falha de rede (padrão 2)
}

// Modelo padrão: "openrouter/free" é o AUTO-ROUTER de gratuitos — o próprio
// OpenRouter escolhe um modelo :free ativo na hora. Como os :free ROTACIONAM
// (somem sem aviso), o auto-router evita que o app quebre. Para fixar um modelo
// específico, passe OPENROUTER_MODEL (veja https://openrouter.ai/models, filtro "free").
const DEFAULT_MODEL = 'openrouter/free';
// Rede de segurança: se o modelo escolhido rotacionar para pago (404), caímos
// automaticamente para o auto-router de gratuitos.
const FALLBACK_MODEL = 'openrouter/free';
const DEFAULT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class OpenRouterLLM implements LLMPort {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(config: OpenRouterConfig) {
    if (!config.apiKey) {
      throw new Error(
        'OpenRouterLLM: apiKey vazia. Defina OPENROUTER_API_KEY (crie em https://openrouter.ai/keys).',
      );
    }
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.url = config.baseUrl ?? DEFAULT_URL;
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.retries = config.retries ?? 2;
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      return await this.attempt(systemPrompt, userPrompt, this.model);
    } catch (err) {
      // AUTO-CURA: se o modelo escolhido saiu do gratuito (404), o app não
      // quebra — ele cai automaticamente para o auto-router de gratuitos, que
      // sempre tem algum modelo ativo. Isso evita ter que editar o .env toda vez
      // que um modelo ":free" rotaciona para pago.
      const rotacionou =
        err instanceof HttpError && err.status === 404 && this.model !== FALLBACK_MODEL;
      if (rotacionou) {
        console.warn(
          `⚠️  Modelo "${this.model}" indisponível no gratuito. Usando "${FALLBACK_MODEL}"...`,
        );
        return await this.attempt(systemPrompt, userPrompt, FALLBACK_MODEL);
      }
      throw err;
    }
  }

  /** Tenta gerar com um modelo específico, com retry de rede e timeout. */
  private async attempt(
    systemPrompt: string,
    userPrompt: string,
    model: string,
  ): Promise<string> {
    // Tenta algumas vezes: falhas de REDE (o "fetch failed") costumam ser
    // passageiras. Erros de HTTP (4xx) NÃO são retentados — não adianta insistir.
    // Backoff simples: espera um pouco mais a cada tentativa.
    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa <= this.retries; tentativa++) {
      try {
        return await this.callOnce(systemPrompt, userPrompt, model);
      } catch (err) {
        if (err instanceof HttpError) throw err; // erro do servidor → não retenta
        ultimoErro = err;
        if (tentativa < this.retries) {
          await sleep(500 * (tentativa + 1)); // 0.5s, 1s, ...
        }
      }
    }
    throw new Error(
      `Falha de rede ao chamar o OpenRouter após ${this.retries + 1} tentativas: ` +
        `${descreverErro(ultimoErro)}. Verifique sua conexão.`,
    );
  }

  /** Uma tentativa: monta a requisição, com timeout, e lê a resposta. */
  private async callOnce(
    systemPrompt: string,
    userPrompt: string,
    model: string,
  ): Promise<string> {
    // AbortController corta a requisição se ela passar do tempo limite.
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
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      // Erro de HTTP (chave inválida, limite, modelo fora...) → mensagem clara.
      if (!response.ok) {
        const detalhe = await response.text().catch(() => '');
        throw new HttpError(response.status, detalhe);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== 'string') {
        throw new HttpError(200, 'resposta sem conteúdo de texto.');
      }
      return text;
    } finally {
      clearTimeout(timer); // sempre limpa o timer (deu certo ou não)
    }
  }
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

/** Extrai uma descrição útil do erro de rede (o "fetch failed" esconde a causa). */
function descreverErro(err: unknown): string {
  if (err instanceof Error) {
    const causa = (err as { cause?: { message?: string } }).cause;
    return causa?.message ? `${err.message} (${causa.message})` : err.message;
  }
  return String(err);
}
