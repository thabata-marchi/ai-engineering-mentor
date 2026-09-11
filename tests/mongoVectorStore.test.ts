// Teste de INTEGRAÇÃO do MongoVectorStore.
//
// Diferente dos outros testes (que são puros e rápidos), este precisa de um
// MongoDB DE VERDADE rodando. Então ele é OPT-IN: só executa se você definir a
// variável MONGO_TEST_URL. Sem ela, é PULADO — assim o `npm test` continua
// rápido e sem dependência externa.
//
// Como rodar (com o Mongo do Docker no ar):
//   MONGO_TEST_URL="mongodb://localhost:27017" npm test
//
// (A lógica de ranking em si — cosseno, ordenação, top-k — já é testada de forma
//  pura em similarity.test.ts e inMemoryVectorStore.test.ts.)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MongoVectorStore } from '../src/adapters/mongoVectorStore.ts';
import type { Chunk } from '../src/core/models.ts';

const url = process.env.MONGO_TEST_URL;
const skip = !url ? 'defina MONGO_TEST_URL para rodar (precisa de um Mongo no ar)' : false;

function chunk(id: string): Chunk {
  return { id, documentId: 'd1', text: `texto ${id}`, position: 0 };
}

test('MongoVectorStore: add + search recupera o mais parecido', { skip }, async () => {
  const store = new MongoVectorStore({
    url: url!,
    dbName: 'ai_mentor_test',
    collectionName: `chunks_${Date.now()}`, // coleção única por execução
  });

  try {
    await store.clear();
    await store.add(
      [chunk('a'), chunk('b'), chunk('c')],
      [
        [1, 0], // leste
        [0, 1], // norte
        [0.9, 0.1], // quase leste (parecido com a)
      ],
    );

    assert.equal(await store.count(), 3);

    const result = await store.search([1, 0], 2);
    assert.equal(result.chunks.length, 2);
    assert.equal(result.chunks[0].chunk.id, 'a'); // mais parecido
    assert.equal(result.chunks[1].chunk.id, 'c'); // segundo
  } finally {
    await store.clear();
    await store.close();
  }
});
