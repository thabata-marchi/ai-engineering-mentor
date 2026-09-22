// Testes da memória de conversa (Etapa 8): o adapter em memória e o mentor
// lembrando do histórico. Tudo com dublês — rápido e sem Mongo.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { InMemoryMemory } from '../src/adapters/inMemoryMemory.ts';
import { InMemoryVectorStore } from '../src/adapters/inMemoryVectorStore.ts';
import { SlidingWindowChunker } from '../src/core/chunker.ts';
import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import type { Document } from '../src/core/models.ts';
import { FakeEmbedder } from './helpers/fakeEmbedder.ts';
import { FakeLLM } from './helpers/fakeLLM.ts';

test('InMemoryMemory: append + history mantém a ordem e respeita o limite', async () => {
  const mem = new InMemoryMemory();
  await mem.append('s1', { role: 'student', text: 'oi', at: '2026-01-01T00:00:00Z' });
  await mem.append('s1', { role: 'mentor', text: 'olá', at: '2026-01-01T00:00:01Z' });
  await mem.append('s1', { role: 'student', text: 'tchau', at: '2026-01-01T00:00:02Z' });

  const tudo = await mem.history('s1');
  assert.deepEqual(tudo.map((t) => t.text), ['oi', 'olá', 'tchau']);

  const ultimos2 = await mem.history('s1', 2);
  assert.deepEqual(ultimos2.map((t) => t.text), ['olá', 'tchau']);

  // Sessões são isoladas.
  assert.deepEqual(await mem.history('outra'), []);
});

/** Monta um mentor com base indexada + memória, pronto para conversar. */
async function setup(llm: FakeLLM, mem: InMemoryMemory) {
  const embedder = new FakeEmbedder();
  const store = new InMemoryVectorStore();
  const chunker = new SlidingWindowChunker({ chunkSizeWords: 60, overlapWords: 10 });
  const doc: Document = {
    id: 'srp',
    source: 'srp.md',
    text: 'single responsibility principle: uma classe tem um motivo para mudar',
  };
  const chunks = chunker.chunk(doc);
  await store.add(chunks, await embedder.embed(chunks.map((c) => c.text)));

  return new AnswerQuestion({ embedder, store, llm, memory: mem, topK: 1 });
}

test('mentor com memória: grava os turnos da conversa', async () => {
  const mem = new InMemoryMemory();
  const useCase = await setup(new FakeLLM('resposta 1'), mem);

  await useCase.execute('o que é SRP?', 'sessao-A');

  const turns = await mem.history('sessao-A');
  assert.equal(turns.length, 2); // pergunta do aluno + resposta do mentor
  assert.equal(turns[0].role, 'student');
  assert.equal(turns[0].text, 'o que é SRP?');
  assert.equal(turns[1].role, 'mentor');
  assert.equal(turns[1].text, 'resposta 1');
});

test('mentor com memória: injeta o histórico no prompt do 2º turno', async () => {
  const mem = new InMemoryMemory();
  const llm = new FakeLLM();
  const useCase = await setup(llm, mem);

  await useCase.execute('primeira pergunta', 'sessao-B');
  await useCase.execute('e agora?', 'sessao-B');

  // No 2º turno, o prompt enviado ao LLM deve conter o histórico da 1ª troca.
  assert.match(llm.lastUserPrompt, /CONVERSATION HISTORY/);
  assert.match(llm.lastUserPrompt, /primeira pergunta/);
});

test('sem sessionId: funciona como antes, sem gravar memória', async () => {
  const mem = new InMemoryMemory();
  const useCase = await setup(new FakeLLM(), mem);

  await useCase.execute('pergunta solta'); // sem sessionId
  assert.deepEqual(await mem.history('qualquer'), []);
});
