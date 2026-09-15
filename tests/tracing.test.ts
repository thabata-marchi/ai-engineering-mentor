// Testes do tracing (Etapa 13). Relógio controlado → duração determinística.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { InMemoryTracer, NoopTracer } from '../src/core/tracing.ts';

test('InMemoryTracer: registra nome, duração e atributos ao encerrar', () => {
  let t = 100;
  const tracer = new InMemoryTracer(() => t);

  const span = tracer.startSpan('retrieval', { topK: 5 });
  t = 130; // passaram 30ms
  span.setAttribute('sources', 3);
  span.end();

  assert.equal(tracer.spans.length, 1);
  assert.equal(tracer.spans[0].name, 'retrieval');
  assert.equal(tracer.spans[0].durationMs, 30);
  assert.deepEqual(tracer.spans[0].attributes, { topK: 5, sources: 3 });
});

test('InMemoryTracer: encerrar duas vezes não duplica o span', () => {
  const tracer = new InMemoryTracer(() => 0);
  const span = tracer.startSpan('x');
  span.end();
  span.end();
  assert.equal(tracer.spans.length, 1);
});

test('NoopTracer: não quebra e não registra nada', () => {
  const tracer = new NoopTracer();
  const span = tracer.startSpan('qualquer', { a: 1 });
  span.setAttribute('b', 2);
  span.end(); // não deve lançar
  assert.ok(true);
});
