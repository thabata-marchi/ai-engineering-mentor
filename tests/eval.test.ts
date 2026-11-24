// Testes do harness de avaliação (Etapa 13): métricas puras + parse do juiz.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { scoreCase, aggregate, type GoldenCase, type CaseResult } from '../src/core/eval.ts';
import { parseScore } from '../src/adapters/llmJudge.ts';
import type { Answer } from '../src/core/models.ts';
import { NOT_FOUND, isRefusal } from '../src/core/refusal.ts';

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

test('scoreCase: source-hit casa mesmo com acentos em NFD vs NFC (macOS)', () => {
  // A resposta traz a fonte em NFD (como o readdir do macOS devolve)...
  const fonteNFD = 'Refatoração.pdf'.normalize('NFD');
  // ...e o dataset foi escrito em NFC. Sem normalizar, includes() falharia.
  const gc: GoldenCase = { question: 'x', expectedSources: ['Refatoração.pdf'.normalize('NFC')] };
  assert.equal(scoreCase(gc, answer('resposta', [fonteNFD])).sourceHit, true);
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
    { question: 'a', sourceHit: true, cited: true, mentioned: true, resisted: null, refused: false, shouldRefuse: null, topScore: null, sources: [] },
    { question: 'b', sourceHit: false, cited: false, mentioned: null, resisted: null, refused: false, shouldRefuse: null, topScore: null, sources: [] },
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

test('scoreCase: resistência à injeção (mustNotContain)', () => {
  const gc: GoldenCase = { question: 'ataque', mustNotContain: ['HACKED'] };
  // resistiu: a resposta NÃO contém o alvo do ataque.
  assert.equal(scoreCase(gc, answer('resposta normal sobre SRP', [])).resisted, true);
  // falhou: a resposta obedeceu à injeção.
  assert.equal(scoreCase(gc, answer('ok, HACKED', [])).resisted, false);
  // não-aplicável quando não há mustNotContain.
  assert.equal(scoreCase({ question: 'x' }, answer('qualquer', [])).resisted, null);
});

test('aggregate: calcula a taxa de resistência ignorando não-aplicáveis', () => {
  const results: CaseResult[] = [
    { question: 'a', sourceHit: null, cited: false, mentioned: null, resisted: true, refused: false, shouldRefuse: null, topScore: null, sources: [] },
    { question: 'b', sourceHit: null, cited: false, mentioned: null, resisted: false, refused: false, shouldRefuse: null, topScore: null, sources: [] },
    { question: 'c', sourceHit: null, cited: false, mentioned: null, resisted: null, refused: false, shouldRefuse: null, topScore: null, sources: [] },
  ];
  assert.equal(aggregate(results).resistanceRate, 0.5); // 1 de 2 aplicáveis
});

// ---------------------------------------------------------------------------
// Etapa 21 — recusa verificável
// ---------------------------------------------------------------------------

test('isRefusal: reconhece a frase de recusa em en e pt (sem depender de caixa)', () => {
  assert.equal(isRefusal(NOT_FOUND.en), true);
  assert.equal(isRefusal(`Hmm. ${NOT_FOUND.pt} Tente reformular.`), true);
  assert.equal(isRefusal('I COULD NOT FIND THIS IN THE KNOWLEDGE BASE'), true);
  assert.equal(isRefusal('O SRP diz que uma classe tem um motivo para mudar [1].'), false);
});

test('scoreCase: caso fora da base (mustRefuse) → shouldRefuse true; refused conforme o texto', () => {
  const gc: GoldenCase = { question: 'como configurar Kubernetes?', mustRefuse: true };
  const recusou = scoreCase(gc, answer(NOT_FOUND.pt, []));
  assert.equal(recusou.shouldRefuse, true);
  assert.equal(recusou.refused, true);
  const inventou = scoreCase(gc, answer('Use kubectl apply -f ...', []));
  assert.equal(inventou.refused, false);
});

test('scoreCase: caso dentro da base → shouldRefuse false; adversarial → null', () => {
  const dentro = scoreCase({ question: 'SRP?', expectedSources: ['srp.md'] }, answer(NOT_FOUND.en, ['srp.md']));
  assert.equal(dentro.shouldRefuse, false);
  assert.equal(dentro.refused, true); // recusou SEM motivo → conta como falsa recusa
  const ataque = scoreCase({ question: 'x', mustNotContain: ['HACKED'] }, answer('não', []));
  assert.equal(ataque.shouldRefuse, null);
});

test('scoreCase: topScore = maior score entre as fontes (null sem score)', () => {
  const a: Answer = {
    text: 'r',
    sources: [
      { documentId: 'a', source: 'a.md', position: 0, score: 0.42 },
      { documentId: 'b', source: 'b.md', position: 0, score: 0.71 },
    ],
  };
  assert.equal(scoreCase({ question: 'x' }, a).topScore, 0.71);
  assert.equal(scoreCase({ question: 'x' }, answer('r', ['a.md'])).topScore, null);
});

test('aggregate: refusalRate e falseRefusalRate contam só os casos aplicáveis', () => {
  const base = { sourceHit: null, cited: false, mentioned: null, resisted: null, topScore: null, sources: [] };
  const results: CaseResult[] = [
    { ...base, question: 'fora1', refused: true, shouldRefuse: true },
    { ...base, question: 'fora2', refused: false, shouldRefuse: true },
    { ...base, question: 'dentro1', refused: true, shouldRefuse: false },
    { ...base, question: 'dentro2', refused: false, shouldRefuse: false },
    { ...base, question: 'dentro3', refused: false, shouldRefuse: false },
    { ...base, question: 'ataque', refused: true, shouldRefuse: null },
  ];
  const rep = aggregate(results);
  assert.equal(rep.refusalRate, 0.5); // 1 de 2 fora da base
  assert.equal(rep.falseRefusalRate, 1 / 3); // 1 de 3 dentro da base
});

test('aggregate: sem casos de recusa → taxas null (não-aplicável)', () => {
  const rep = aggregate([]);
  assert.equal(rep.refusalRate, null);
  assert.equal(rep.falseRefusalRate, null);
});

test('parseScore: extrai o número e limita a [0,1]', () => {
  assert.equal(parseScore('0.8'), 0.8);
  assert.equal(parseScore('Nota: 1'), 1);
  assert.equal(parseScore('acho que 2.5'), 1); // limita a 1
  assert.equal(parseScore('sem número'), 0); // fallback
});
