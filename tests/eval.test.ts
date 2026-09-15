// Testes do harness de avaliação (Etapa 13): métricas puras + parse do juiz.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { scoreCase, aggregate, type GoldenCase, type CaseResult } from '../src/core/eval.ts';
import { parseNota } from '../src/adapters/llmJudge.ts';
import type { Answer } from '../src/core/models.ts';

function answer(text: string, sources: string[]): Answer {
  return { text, sources: sources.map((s, i) => ({ documentId: s, source: s, position: i })) };
}

test('scoreCase: fonte esperada presente + citação + menção → tudo verdadeiro', () => {
  const gc: GoldenCase = {
    question: 'o que é SRP?',
    expectedSources: ['srp.md'],
    mustMention: ['responsabilidade'],
  };
  const r = scoreCase(gc, answer('A responsabilidade única... [1]', ['srp.md']));
  assert.equal(r.sourceHit, true);
  assert.equal(r.cited, true);
  assert.equal(r.mentioned, true);
});

test('scoreCase: fonte esperada ausente e sem citação', () => {
  const gc: GoldenCase = { question: 'x', expectedSources: ['srp.md'] };
  const r = scoreCase(gc, answer('sem citar nada', ['outro.md']));
  assert.equal(r.sourceHit, false);
  assert.equal(r.cited, false);
  assert.equal(r.mentioned, null); // não havia mustMention → não-aplicável
});

test('aggregate: calcula as taxas e ignora métricas não-aplicáveis', () => {
  const results: CaseResult[] = [
    { question: 'a', sourceHit: true, cited: true, mentioned: true, sources: [] },
    { question: 'b', sourceHit: false, cited: false, mentioned: null, sources: [] },
  ];
  const rep = aggregate(results);
  assert.equal(rep.total, 2);
  assert.equal(rep.sourceHitRate, 0.5); // 1 de 2
  assert.equal(rep.citationRate, 0.5); // 1 de 2
  assert.equal(rep.mentionRate, 1); // só 1 aplicável, e passou
});

test('aggregate: inclui faithfulness quando fornecido', () => {
  const rep = aggregate([], 0.75);
  assert.equal(rep.faithfulness, 0.75);
});

test('parseNota: extrai o número e limita a [0,1]', () => {
  assert.equal(parseNota('0.8'), 0.8);
  assert.equal(parseNota('Nota: 1'), 1);
  assert.equal(parseNota('acho que 2.5'), 1); // limita a 1
  assert.equal(parseNota('sem número'), 0); // fallback
});
