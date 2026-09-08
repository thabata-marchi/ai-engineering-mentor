// Teste de INTEGRAÇÃO leve: junta 3 peças do RAG (embedder + vector store +
// busca) usando o FakeEmbedder — sem baixar modelo, sem internet.
//
// A ideia: indexamos alguns chunks, "perguntamos" algo e conferimos se o chunk
// mais relevante (o que compartilha palavras com a pergunta) vem em 1º lugar.
// É a prova de que o encanamento embed → store → search funciona ponta a ponta.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { InMemoryVectorStore } from '../src/adapters/inMemoryVectorStore.ts';
import type { Chunk } from '../src/core/models.ts';
import { FakeEmbedder } from './helpers/fakeEmbedder.ts';

/** monta os chunks de exemplo (dois assuntos bem diferentes). */
function sampleChunks(): Chunk[] {
  return [
    {
      id: 'srp',
      documentId: 'clean-code',
      text: 'single responsibility principle: cada classe tem um motivo para mudar',
      position: 0,
    },
    {
      id: 'repo',
      documentId: 'ddd',
      text: 'repository pattern abstrai o acesso ao banco de dados',
      position: 1,
    },
  ];
}

test('pipeline: a pergunta recupera o chunk com o mesmo assunto', async () => {
  const embedder = new FakeEmbedder();
  const store = new InMemoryVectorStore();

  // 1. Indexar: vetoriza os textos e guarda no vector store.
  const chunks = sampleChunks();
  const embeddings = await embedder.embed(chunks.map((c) => c.text));
  await store.add(chunks, embeddings);

  // 2. Perguntar: vetoriza a pergunta com o MESMO embedder.
  const [queryVector] = await embedder.embed([
    'o que é o single responsibility principle?',
  ]);

  // 3. Buscar: o top-1 deve ser o chunk sobre SRP (compartilha palavras).
  const result = await store.search(queryVector, 1);
  assert.equal(result.chunks[0].chunk.id, 'srp');
});

test('pipeline: pergunta sobre banco recupera o chunk de repository', async () => {
  const embedder = new FakeEmbedder();
  const store = new InMemoryVectorStore();

  const chunks = sampleChunks();
  const embeddings = await embedder.embed(chunks.map((c) => c.text));
  await store.add(chunks, embeddings);

  const [queryVector] = await embedder.embed(['como abstrair o acesso ao banco de dados']);

  const result = await store.search(queryVector, 1);
  assert.equal(result.chunks[0].chunk.id, 'repo');
});

test('FakeEmbedder é determinístico: mesmo texto → mesmo vetor', async () => {
  const embedder = new FakeEmbedder();
  const [a] = await embedder.embed(['texto igual']);
  const [b] = await embedder.embed(['texto igual']);
  assert.deepEqual(a, b);
});
