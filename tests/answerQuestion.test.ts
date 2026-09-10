// Testes do caso de uso AnswerQuestion — o RAG completo, com dublês.
// Usamos FakeEmbedder + InMemoryVectorStore + FakeLLM: nada de rede, nada de
// modelo baixado, resultado 100% determinístico.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { SlidingWindowChunker } from '../src/core/chunker.ts';
import { InMemoryVectorStore } from '../src/adapters/inMemoryVectorStore.ts';
import type { Document } from '../src/core/models.ts';
import { FakeEmbedder } from './helpers/fakeEmbedder.ts';
import { FakeLLM } from './helpers/fakeLLM.ts';

/** Prepara um store já indexado com dois documentos de assuntos diferentes. */
async function setup() {
  const embedder = new FakeEmbedder();
  const store = new InMemoryVectorStore();
  const chunker = new SlidingWindowChunker({ chunkSizeWords: 60, overlapWords: 10 });

  const docs: Document[] = [
    {
      id: 'repository',
      source: 'repository.md',
      text: 'O padrão repository abstrai o acesso ao banco de dados atrás de uma interface.',
    },
    {
      id: 'srp',
      source: 'srp.md',
      text: 'O single responsibility principle diz que uma classe deve ter um motivo para mudar.',
    },
  ];

  for (const doc of docs) {
    const chunks = chunker.chunk(doc);
    const embeddings = await embedder.embed(chunks.map((c) => c.text));
    await store.add(chunks, embeddings);
  }

  return { embedder, store };
}

test('responde e devolve a fonte correta do trecho recuperado', async () => {
  const { embedder, store } = await setup();
  const llm = new FakeLLM('O repository isola o banco. [1]');

  const useCase = new AnswerQuestion({ embedder, store, llm, topK: 1 });
  const answer = await useCase.execute('como abstrair o acesso ao banco de dados?');

  // O texto vem do LLM (aqui, o fake).
  assert.equal(answer.text, 'O repository isola o banco. [1]');

  // A fonte citada é o documento certo, com o NOME DO ARQUIVO (rastreabilidade).
  assert.equal(answer.sources.length, 1);
  assert.equal(answer.sources[0].documentId, 'repository');
  assert.equal(answer.sources[0].source, 'repository.md');
  assert.equal(answer.sources[0].position, 0);
});

test('o contexto recuperado é REALMENTE enviado ao LLM (grounding)', async () => {
  const { embedder, store } = await setup();
  const llm = new FakeLLM();

  const useCase = new AnswerQuestion({ embedder, store, llm, topK: 1 });
  await useCase.execute('o que é single responsibility principle?');

  // O prompt enviado ao LLM deve conter o trecho recuperado e a pergunta.
  assert.match(llm.lastUserPrompt, /single responsibility principle/i);
  assert.match(llm.lastUserPrompt, /PERGUNTA:/);
  // E as regras do "não invento" vão no system prompt.
  assert.match(llm.lastSystemPrompt, /SOMENTE com base no CONTEXTO/i);
});

test('modo guiado (padrão) usa o prompt socrático', async () => {
  const { embedder, store } = await setup();
  const llm = new FakeLLM();

  const useCase = new AnswerQuestion({ embedder, store, llm, topK: 1 }); // sem mode = guiado
  await useCase.execute('o que é repository?');

  // O prompt guiado NÃO entrega a resposta pronta — pede pra começar com pergunta.
  assert.match(llm.lastSystemPrompt, /NÃO entregue a resposta pronta/i);
});

test('modo direto usa o prompt de resposta pronta', async () => {
  const { embedder, store } = await setup();
  const llm = new FakeLLM();

  const useCase = new AnswerQuestion({ embedder, store, llm, topK: 1, mode: 'direto' });
  await useCase.execute('o que é repository?');

  // No modo direto não há a regra socrática de "não entregar pronto".
  assert.doesNotMatch(llm.lastSystemPrompt, /NÃO entregue a resposta pronta/i);
});

test('sem contexto (store vazio) → sem fontes, mas ainda responde', async () => {
  const embedder = new FakeEmbedder();
  const store = new InMemoryVectorStore(); // vazio
  const llm = new FakeLLM('Não encontrei isso na base de conhecimento.');

  const useCase = new AnswerQuestion({ embedder, store, llm });
  const answer = await useCase.execute('qualquer pergunta');

  assert.equal(answer.sources.length, 0);
  assert.match(llm.lastUserPrompt, /nenhum trecho encontrado/i);
  assert.equal(answer.text, 'Não encontrei isso na base de conhecimento.');
});
