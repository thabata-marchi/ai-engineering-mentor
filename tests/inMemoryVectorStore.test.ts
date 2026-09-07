// Testes do InMemoryVectorStore. Passamos vetores "à mão" (não precisamos de um
// embedder real aqui) para provar a busca por similaridade de forma determinística.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { InMemoryVectorStore } from '../src/adapters/inMemoryVectorStore.ts';
import type { Chunk } from '../src/core/models.ts';

/** Helper: cria um Chunk simples com um id. */
function chunk(id: string): Chunk {
  return { id, documentId: 'd1', text: `texto ${id}`, position: 0 };
}

test('busca retorna os chunks mais parecidos primeiro (top-k)', async () => {
  const store = new InMemoryVectorStore();

  // 3 chunks em direções diferentes:
  await store.add(
    [chunk('a'), chunk('b'), chunk('c')],
    [
      [1, 0], // a → aponta para "leste"
      [0, 1], // b → aponta para "norte"
      [0.9, 0.1], // c → quase "leste" (parecido com a)
    ],
  );

  // Pergunta aponta para "leste" → esperado: a (1º), c (2º), b fica de fora.
  const result = await store.search([1, 0], 2);

  assert.equal(result.chunks.length, 2); // k = 2
  assert.equal(result.chunks[0].chunk.id, 'a'); // o mais parecido
  assert.equal(result.chunks[1].chunk.id, 'c'); // o segundo mais parecido
  assert.ok(result.chunks[0].score > result.chunks[1].score); // ordem por score
});

test('k maior que o total devolve todos, sem quebrar', async () => {
  const store = new InMemoryVectorStore();
  await store.add([chunk('a')], [[1, 0]]);

  const result = await store.search([1, 0], 10);
  assert.equal(result.chunks.length, 1);
});

test('nº de chunks diferente do nº de embeddings → erro', async () => {
  const store = new InMemoryVectorStore();
  await assert.rejects(() => store.add([chunk('a'), chunk('b')], [[1, 0]]), /≠/);
});
