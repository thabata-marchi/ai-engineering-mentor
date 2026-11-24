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
import { NOT_FOUND } from '../src/core/refusal.ts';
import { InMemoryTracer } from '../src/core/tracing.ts';

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
  assert.match(llm.lastUserPrompt, /QUESTION:/);
  // E as regras do "não invento" vão no system prompt (agora em inglês por padrão).
  assert.match(llm.lastSystemPrompt, /ONLY based on the CONTEXT/i);
});

test('modo guiado (padrão) usa o prompt socrático', async () => {
  const { embedder, store } = await setup();
  const llm = new FakeLLM();

  const useCase = new AnswerQuestion({ embedder, store, llm, topK: 1 }); // sem mode = guided
  await useCase.execute('o que é repository?');

  // O prompt guiado NÃO entrega a resposta pronta — pede pra começar com pergunta.
  assert.match(llm.lastSystemPrompt, /Do NOT hand over the full answer/i);
});

test('modo direto usa o prompt de resposta pronta', async () => {
  const { embedder, store } = await setup();
  const llm = new FakeLLM();

  const useCase = new AnswerQuestion({ embedder, store, llm, topK: 1, mode: 'direct' });
  await useCase.execute('o que é repository?');

  // No modo direto não há a regra socrática de "não entregar pronto".
  assert.doesNotMatch(llm.lastSystemPrompt, /Do NOT hand over the full answer/i);
});

test('lang: pt faz o system prompt pedir resposta em português', async () => {
  const { embedder, store } = await setup();
  const llm = new FakeLLM();

  const useCase = new AnswerQuestion({ embedder, store, llm, topK: 1, lang: 'pt' });
  await useCase.execute('o que é repository?');

  assert.match(llm.lastSystemPrompt, /Responda em português|Fale em português/i);
});

test('sem contexto (store vazio) → sem fontes, mas ainda responde', async () => {
  const embedder = new FakeEmbedder();
  const store = new InMemoryVectorStore(); // vazio
  const llm = new FakeLLM('Não encontrei isso na base de conhecimento.');

  const useCase = new AnswerQuestion({ embedder, store, llm });
  const answer = await useCase.execute('qualquer pergunta');

  assert.equal(answer.sources.length, 0);
  assert.match(llm.lastUserPrompt, /no snippet found/i);
  assert.equal(answer.text, 'Não encontrei isso na base de conhecimento.');
});

// ---------------------------------------------------------------------------
// Etapa 21 — limiar de similaridade (minScore)
// ---------------------------------------------------------------------------

/** LLM que conta as chamadas — para provar que o limiar NÃO chama o modelo. */
class CountingLLM extends FakeLLM {
  public calls = 0;
  override async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    this.calls++;
    return super.generate(systemPrompt, userPrompt);
  }
}

// Pergunta sem NENHUMA palavra em comum com a base. (Com o FakeEmbedder, que usa
// hash % 256, frases como "como configurar..." colidem por acaso com o doc de SRP.)
test('minScore: nenhum trecho passa → recusa com NOT_FOUND, sem fontes e SEM chamar o LLM', async () => {
  const { embedder, store } = await setup();
  const llm = new CountingLLM('isto não deveria aparecer');

  const useCase = new AnswerQuestion({ embedder, store, llm, minScore: 0.1, lang: 'pt' });
  const answer = await useCase.execute('kubernetes helm chart');

  assert.equal(llm.calls, 0);
  assert.equal(answer.text, NOT_FOUND.pt);
  assert.equal(answer.sources.length, 0);
});

test('minScore: recusa respeita o idioma (en por padrão)', async () => {
  const { embedder, store } = await setup();
  const useCase = new AnswerQuestion({ embedder, store, llm: new CountingLLM(), minScore: 0.1 });
  const answer = await useCase.execute('kubernetes helm chart');
  assert.equal(answer.text, NOT_FOUND.en);
});

test('minScore: descarta só os trechos abaixo do limiar e segue para o LLM', async () => {
  const { embedder, store } = await setup();
  const llm = new CountingLLM('resposta sobre repository [1]');

  // topK 2 traz os dois documentos; só o de repository tem score acima de 0.1.
  const useCase = new AnswerQuestion({ embedder, store, llm, topK: 2, minScore: 0.1 });
  const answer = await useCase.execute('o que é repository?');

  assert.equal(llm.calls, 1);
  assert.deepEqual(
    answer.sources.map((s) => s.source),
    ['repository.md'],
  );
  assert.ok((answer.sources[0].score ?? 0) >= 0.1);
  assert.doesNotMatch(llm.lastUserPrompt, /single responsibility/i); // o trecho filtrado não foi enviado
});

test('sem minScore (padrão): comportamento antigo — usa os topK e chama o LLM', async () => {
  const { embedder, store } = await setup();
  const llm = new CountingLLM();
  const useCase = new AnswerQuestion({ embedder, store, llm, topK: 2 });
  const answer = await useCase.execute('kubernetes helm chart');
  assert.equal(llm.calls, 1);
  assert.equal(answer.sources.length, 2);
});

test('minScore: o span de retrieval registra refusedByThreshold e belowThreshold', async () => {
  const { embedder, store } = await setup();
  const tracer = new InMemoryTracer(() => 0);
  const useCase = new AnswerQuestion({
    embedder,
    store,
    llm: new CountingLLM(),
    topK: 2,
    minScore: 0.1,
    tracer,
  });
  await useCase.execute('kubernetes helm chart');

  const retrieval = tracer.spans.find((s) => s.name === 'retrieval');
  assert.equal(retrieval?.attributes.refusedByThreshold, true);
  assert.equal(retrieval?.attributes.belowThreshold, 2);
  assert.equal(tracer.spans.some((s) => s.name === 'generation'), false); // não houve geração
});

test('minScore fora de [0,1] → erro na construção', () => {
  const embedder = new FakeEmbedder();
  const store = new InMemoryVectorStore();
  assert.throws(() => new AnswerQuestion({ embedder, store, llm: new FakeLLM(), minScore: 1.5 }), RangeError);
  assert.throws(() => new AnswerQuestion({ embedder, store, llm: new FakeLLM(), minScore: NaN }), RangeError);
});
