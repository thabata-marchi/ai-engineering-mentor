// ============================================================================
//  tracing — span-based OBSERVABILITY (Step 13)
// ============================================================================
//
//  WHAT IS A "SPAN"?
//  It's the measurement of ONE operation: name + how long it took + attributes
//  (useful data, e.g. how many sources were retrieved). It's the same concept as
//  OpenTelemetry, but here a minimal, local version — enough to SEE what the mentor
//  does inside (retrieval, generation) without an external service.
//
//  WHY A PORT?
//  The instrumented code (AnswerQuestion) only knows `TracerPort`. So we can: observe
//  nothing (NoopTracer, default — zero cost), collect in memory (InMemoryTracer, for
//  tests/inspection) or print (ConsoleTracer). Swapping for LangSmith later would be
//  just another adapter, without touching the core.
// ============================================================================

/** A measured operation: name, duration and collected attributes. */
export interface Span {
  readonly name: string;
  readonly durationMs: number;
  readonly attributes: Record<string, unknown>;
}

/** "Handle" of an in-progress span: you can attach attributes and then end it. */
export interface SpanHandle {
  setAttribute(key: string, value: unknown): void;
  end(): void;
}

/** The tracing contract. The instrumenter depends only on this. */
export interface TracerPort {
  startSpan(name: string, attributes?: Record<string, unknown>): SpanHandle;
}

/** Default: observes NOTHING (zero cost). Used when nobody passes a tracer. */
export class NoopTracer implements TracerPort {
  // Ignores the arguments, but keeps the SAME signature as the port (otherwise
  // TypeScript complains when calling startSpan(name, attrs) through the NoopTracer).
  startSpan(_name?: string, _attributes?: Record<string, unknown>): SpanHandle {
    return { setAttribute() {}, end() {} };
  }
}

/**
 * Collects finished spans in memory — for tests and to inspect the flow. The clock
 * is injectable (`now`), so you can test the duration without waiting.
 */
export class InMemoryTracer implements TracerPort {
  public readonly spans: Span[] = [];
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  startSpan(name: string, attributes: Record<string, unknown> = {}): SpanHandle {
    const start = this.now();
    const attrs: Record<string, unknown> = { ...attributes };
    const spans = this.spans;
    const now = this.now;
    let ended = false;
    return {
      setAttribute(key, value) {
        attrs[key] = value;
      },
      end() {
        if (ended) return; // idempotent: ending twice doesn't duplicate
        ended = true;
        spans.push({ name, durationMs: now() - start, attributes: attrs });
      },
    };
  }
}

/** Prints each span (on end) to stderr — to follow along live. */
export class ConsoleTracer implements TracerPort {
  startSpan(name: string, attributes: Record<string, unknown> = {}): SpanHandle {
    const start = Date.now();
    const attrs: Record<string, unknown> = { ...attributes };
    return {
      setAttribute(key, value) {
        attrs[key] = value;
      },
      end() {
        const dur = Date.now() - start;
        // stderr (not stdout) so it doesn't pollute the MCP protocol.
        console.error(`🔎 [trace] ${name} ${dur}ms ${JSON.stringify(attrs)}`);
      },
    };
  }
}
