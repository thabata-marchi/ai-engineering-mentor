// ============================================================================
//  RateLimiter — limitador de taxa por JANELA DESLIZANTE (Etapa 12 — segurança)
// ============================================================================
//
//  PARA QUE SERVE?
//  Proteger sua COTA do OpenRouter (lembra dos 429 no tier grátis?) e conter um
//  agente que "enlouquece" e chama tools em loop. É uma barreira LOCAL, barata:
//  antes de bater na API, contamos quantas chamadas houve na última janela de
//  tempo; se passou do limite, recusamos com um erro claro.
//
//  POR QUE "JANELA DESLIZANTE"?
//  Guardamos o horário de cada chamada recente. A cada nova chamada, descartamos
//  as que já saíram da janela (ex.: mais velhas que 60s) e contamos o resto. É
//  mais justo que "resetar a cada minuto cheio" (que permitiria rajadas na virada).
//
//  DESIGN: é PURO e determinístico — o "relógio" é injetável (`now`), então os
//  testes controlam o tempo sem esperar de verdade. Mora no core: não sabe de
//  LLM nem de rede; quem aplica são os DECORATORS dos adapters.
// ============================================================================

/** Erro lançado quando o limite de chamadas é excedido. */
export class RateLimitError extends Error {
  readonly retryAfterMs: number; // quanto esperar até liberar de novo
  constructor(retryAfterMs: number) {
    super(
      `Limite de chamadas excedido. Tente novamente em ~${Math.ceil(retryAfterMs / 1000)}s. ` +
        '(protege sua cota do OpenRouter — ajuste em RATE_LIMIT_MAX/RATE_LIMIT_WINDOW_MS)',
    );
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export interface RateLimiterConfig {
  readonly max: number; // máximo de chamadas permitidas por janela
  readonly windowMs: number; // tamanho da janela em ms
  readonly now?: () => number; // relógio injetável (padrão: Date.now) — facilita testes
}

export class RateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly hits: number[] = []; // horários das chamadas recentes (ms)

  constructor(config: RateLimiterConfig) {
    if (config.max <= 0) throw new Error('RateLimiter: max deve ser > 0');
    if (config.windowMs <= 0) throw new Error('RateLimiter: windowMs deve ser > 0');
    this.max = config.max;
    this.windowMs = config.windowMs;
    this.now = config.now ?? Date.now;
  }

  /**
   * Registra uma chamada se houver espaço na janela; caso contrário, lança
   * RateLimitError. Descarta antes os registros que já saíram da janela.
   */
  acquire(): void {
    const agora = this.now();
    this.limpar(agora);
    if (this.hits.length >= this.max) {
      // A janela libera quando o registro MAIS ANTIGO expira.
      const maisAntigo = this.hits[0];
      const retryAfterMs = maisAntigo + this.windowMs - agora;
      throw new RateLimitError(Math.max(0, retryAfterMs));
    }
    this.hits.push(agora);
  }

  /** Quantas chamadas ainda cabem na janela atual (útil para logs/testes). */
  remaining(): number {
    this.limpar(this.now());
    return Math.max(0, this.max - this.hits.length);
  }

  /** Remove os registros que já saíram da janela deslizante. */
  private limpar(agora: number): void {
    const limite = agora - this.windowMs;
    while (this.hits.length > 0 && this.hits[0] <= limite) {
      this.hits.shift();
    }
  }
}
