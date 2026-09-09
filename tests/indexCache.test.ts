// Testes da persistência do índice: snapshot/restore do vector store e o
// round-trip de salvar/ler o cache em disco. Nada de embedder real aqui —
// usamos vetores à mão, como nos outros testes do store.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InMemoryVectorStore } from '../src/adapters/inMemoryVectorStore.ts';
import { loadIndex, saveIndex } from '../src/adapters/indexCache.ts';
import type { Chunk } from '../src/core/models.ts';

function chunk(id: string): Chunk {
  return { id, documentId: 'd1', text: `texto ${id}`, position: 0 };
}

test('snapshot + restore preservam a busca', async () => {
  const original = new InMemoryVectorStore();
  await original.add([chunk('a'), chunk('b')], [[1, 0], [0, 1]]);

  // Salva o estado e recria noutro store.
  const copia = new InMemoryVectorStore();
  copia.restore(original.snapshot());

  const result = await copia.search([1, 0], 1);
  assert.equal(result.chunks[0].chunk.id, 'a'); // busca funciona igual no clone
});

test('saveIndex + loadIndex fazem round-trip fiel', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'idxcache-'));
  const path = join(dir, 'index.json');

  try {
    const store = new InMemoryVectorStore();
    await store.add([chunk('a')], [[0.5, 0.5]]);

    await saveIndex(path, { signature: 'sig-123', entries: store.snapshot() });
    const carregado = await loadIndex(path);

    assert.ok(carregado);
    assert.equal(carregado.signature, 'sig-123');
    assert.equal(carregado.entries.length, 1);
    assert.equal(carregado.entries[0].chunk.id, 'a');
    assert.deepEqual(carregado.entries[0].embedding, [0.5, 0.5]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadIndex devolve null quando não há arquivo', async () => {
  const inexistente = join(tmpdir(), 'nao-existe-' + Date.now(), 'index.json');
  assert.equal(await loadIndex(inexistente), null);
});
