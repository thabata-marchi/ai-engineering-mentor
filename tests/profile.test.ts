// Testes do perfil de aprendizado (Etapa 10): o adapter em memória + a função
// pura resumir(), o mentor REGISTRANDO o estudo ao responder, e a tool MCP
// meu_progresso. Tudo com dublês — rápido e sem Mongo.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { InMemoryProfile, resumir } from '../src/adapters/inMemoryProfile.ts';
import { InMemoryVectorStore } from '../src/adapters/inMemoryVectorStore.ts';
import { SlidingWindowChunker } from '../src/core/chunker.ts';
import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { createMentorMcpServer } from '../src/mcp/mentorServer.ts';
import type { Document, StudyRecord } from '../src/core/models.ts';
import { FakeEmbedder } from './helpers/fakeEmbedder.ts';
import { FakeLLM } from './helpers/fakeLLM.ts';

test('resumir: conta fontes, ordena por frequência e traz as últimas perguntas', () => {
  const registros: StudyRecord[] = [
    { question: 'p1', sources: ['a.md', 'b.md'], at: '2026-01-01T00:00:00Z' },
    { question: 'p2', sources: ['a.md'], at: '2026-01-01T00:00:01Z' },
    { question: 'p3', sources: ['c.md'], at: '2026-01-01T00:00:02Z' },
  ];
  const r = resumir(registros);

  assert.equal(r.total, 3);
  // a.md aparece 2x → deve vir primeiro.
  assert.deepEqual(r.porFonte[0], { source: 'a.md', count: 2 });
  // últimas perguntas da mais nova para a mais antiga.
  assert.deepEqual(r.ultimas, ['p3', 'p2', 'p1']);
});

test('resumir: perfil vazio devolve total 0 e listas vazias', () => {
  const r = resumir([]);
  assert.deepEqual(r, { total: 0, porFonte: [], ultimas: [] });
});

test('InMemoryProfile: record + summary por aluno (isolado)', async () => {
  const profile = new InMemoryProfile();
  await profile.record('aluno-1', 'o que é SRP?', ['clean.md']);
  await profile.record('aluno-1', 'e DIP?', ['clean.md', 'solid.md']);

  const r = await profile.summary('aluno-1');
  assert.equal(r.total, 2);
  assert.deepEqual(r.porFonte[0], { source: 'clean.md', count: 2 });

  // Outro aluno não vê os estudos do primeiro.
  assert.deepEqual(await profile.summary('aluno-2'), { total: 0, porFonte: [], ultimas: [] });
});

/** Monta um mentor com base indexada + perfil, pronto para responder. */
async function setup(profile: InMemoryProfile) {
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
  return new AnswerQuestion({ embedder, store, llm: new FakeLLM('ok'), profile, topK: 1 });
}

test('mentor com perfil: registra a pergunta e a fonte tocada ao responder', async () => {
  const profile = new InMemoryProfile();
  const useCase = await setup(profile);

  await useCase.execute('o que é SRP?', 'sessao-A');

  const r = await profile.summary('sessao-A');
  assert.equal(r.total, 1);
  assert.deepEqual(r.ultimas, ['o que é SRP?']);
  assert.equal(r.porFonte[0].source, 'srp.md');
});

test('mentor sem sessionId: registra sob "default"', async () => {
  const profile = new InMemoryProfile();
  const useCase = await setup(profile);

  await useCase.execute('pergunta solta'); // sem sessionId
  assert.equal((await profile.summary('default')).total, 1);
});

test('MCP: tool meu_progresso devolve o resumo do aluno', async () => {
  const profile = new InMemoryProfile();
  const useCase = await setup(profile);
  await useCase.execute('o que é SRP?', 'sessao-X'); // gera 1 registro

  const server = createMentorMcpServer(useCase, profile);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'teste', version: '1.0.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);

  try {
    const { tools } = await client.listTools();
    assert.ok(tools.some((t) => t.name === 'my_progress'));

    const result = await client.callTool({
      name: 'my_progress',
      arguments: { session: 'sessao-X' },
    });
    const texto = (result.content as { type: string; text: string }[])[0].text;
    assert.match(texto, /Questions asked: 1/);
    assert.match(texto, /srp\.md/);
  } finally {
    await client.close();
    await server.close();
  }
});

test('MCP: sem perfil, a tool meu_progresso não é registrada', async () => {
  const embedder = new FakeEmbedder();
  const store = new InMemoryVectorStore();
  const useCase = new AnswerQuestion({ embedder, store, llm: new FakeLLM(), topK: 1 });
  const server = createMentorMcpServer(useCase); // sem profile

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'teste', version: '1.0.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);

  try {
    const { tools } = await client.listTools();
    assert.ok(!tools.some((t) => t.name === 'my_progress'));
    assert.ok(tools.some((t) => t.name === 'ask'));
  } finally {
    await client.close();
    await server.close();
  }
});
