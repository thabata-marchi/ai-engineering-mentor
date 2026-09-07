// Testes da similaridade de cosseno — matemática pura, resultados exatos.
// Usamos vetores 2D fáceis de visualizar como "flechas".

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cosineSimilarity } from '../src/core/similarity.ts';

test('vetores idênticos em direção → 1', () => {
  // Mesma direção (tamanho diferente não importa no cosseno).
  assert.equal(cosineSimilarity([1, 0], [2, 0]), 1);
});

test('vetores perpendiculares → 0', () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test('vetores opostos → -1', () => {
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test('vetor zero não quebra (retorna 0)', () => {
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test('tamanhos diferentes → erro claro', () => {
  assert.throws(() => cosineSimilarity([1, 0], [1, 0, 0]), /tamanhos diferentes/);
});
