// ============================================================================
//  tracing — OBSERVABILIDADE por spans (Etapa 13)
// ============================================================================
//
//  O QUE É UM "SPAN"?
//  É a medição de UMA operação: nome + quanto durou + atributos (dados úteis,
//  ex.: quantas fontes foram recuperadas). É o mesmo conceito do OpenTelemetry,
//  só que aqui numa versão mínima e local — o suficiente para ENXERGAR o que o
//  mentor faz por dentro (retrieval, geração) sem serviço externo.
//
//  POR QUE UM PORT?
//  O código instrumentado (AnswerQuestion) só conhece o `TracerPort`. Assim
//  podemos: não observar nada (NoopTracer, padrão — custo zero), coletar em
//  memória (InMemoryTracer, para testes/inspeção) ou imprimir (ConsoleTracer).
//  Trocar por LangSmith no futuro seria só mais um adapter, sem tocar no núcleo.
// ============================================================================

/** Uma operação medida: nome, duração e atributos coletados. */
export interface Span {
  readonly name: string;
  readonly durationMs: number;
  readonly attributes: Record<string, unknown>;
}

/** "Alça" de um span em andamento: dá pra anexar atributos e depois encerrar. */
export interface SpanHandle {
  setAttribute(key: string, value: unknown): void;
  end(): void;
}

/** O contrato de tracing. Quem instrumenta só depende disto. */
export interface TracerPort {
  startSpan(name: string, attributes?: Record<string, unknown>): SpanHandle;
}

/** Padrão: NÃO observa nada (custo zero). Usado quando ninguém passa um tracer. */
export class NoopTracer implements TracerPort {
  // Ignora os argumentos, mas mantém a MESMA assinatura do port (senão o
  // TypeScript reclama ao chamar startSpan(nome, attrs) através do NoopTracer).
  startSpan(_name?: string, _attributes?: Record<string, unknown>): SpanHandle {
    return { setAttribute() {}, end() {} };
  }
}

/**
 * Coleta os spans finalizados em memória — para testes e para inspecionar o
 * fluxo. O relógio é injetável (`now`), então dá pra testar a duração sem esperar.
 */
export class InMemoryTracer implements TracerPort {
  public readonly spans: Span[] = [];
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  startSpan(name: string, attributes: Record<string, unknown> = {}): SpanHandle {
    const inicio = this.now();
    const attrs: Record<string, unknown> = { ...attributes };
    const spans = this.spans;
    const now = this.now;
    let encerrado = false;
    return {
      setAttribute(key, value) {
        attrs[key] = value;
      },
      end() {
        if (encerrado) return; // idempotente: encerrar duas vezes não duplica
        encerrado = true;
        spans.push({ name, durationMs: now() - inicio, attributes: attrs });
      },
    };
  }
}

/** Imprime cada span (ao encerrar) no stderr — para acompanhar ao vivo. */
export class ConsoleTracer implements TracerPort {
  startSpan(name: string, attributes: Record<string, unknown> = {}): SpanHandle {
    const inicio = Date.now();
    const attrs: Record<string, unknown> = { ...attributes };
    return {
      setAttribute(key, value) {
        attrs[key] = value;
      },
      end() {
        const dur = Date.now() - inicio;
        // stderr (não stdout) para não sujar o protocolo MCP.
        console.error(`🔎 [trace] ${name} ${dur}ms ${JSON.stringify(attrs)}`);
      },
    };
  }
}
