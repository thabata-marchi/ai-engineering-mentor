// Teste do servidor MCP do mentor. Igual ao curso do Erick: conectamos um
// CLIENTE MCP ao servidor e chamamos as capacidades — mas aqui com um transporte
// EM MEMÓRIA (sem processo/rede) e um mentor FALSO (FakeLLM), então é rápido e
// determinístico. Prova que a tradução para o protocolo MCP funciona.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createMentorMcpServer } from '../src/mcp/mentorServer.ts';
import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { InMemoryVectorStore } from '../src/adapters/inMemoryVectorStore.ts';
import { SlidingWindowChunker } from '../src/core/chunker.ts';
import type { Document } from '../src/core/models.ts';
import { FakeEmbedder } from './helpers/fakeEmbedder.ts';
import { FakeLLM } from './helpers/fakeLLM.ts';

/** Monta um mentor falso já indexado, pronto para virar servidor MCP. */
async function fakeUseCase(llm: FakeLLM): Promise<AnswerQuestion> {
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
  return new AnswerQuestion({ embedder, store, llm, topK: 1 });
}

/** Liga um cliente e um servidor MCP por um transporte em memória. */
async function connectPair(server: ReturnType<typeof createMentorMcpServer>) {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'teste', version: '1.0.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

test('MCP: cliente lista a tool "perguntar" e recebe a resposta do mentor', async () => {
  const server = createMentorMcpServer(await fakeUseCase(new FakeLLM('resposta via MCP')));
  const client = await connectPair(server);

  try {
    const { tools } = await client.listTools();
    assert.ok(tools.some((t) => t.name === 'ask'));

    const result = await client.callTool({
      name: 'ask',
      arguments: { question: 'o que é SRP?' },
    });
    const texto = (result.content as { type: string; text: string }[])[0].text;
    assert.match(texto, /resposta via MCP/);
    assert.match(texto, /Sources/); // trouxe a rastreabilidade
  } finally {
    await client.close();
    await server.close();
  }
});

test('MCP: expõe o resource da base e o prompt de estudo guiado', async () => {
  const server = createMentorMcpServer(await fakeUseCase(new FakeLLM()));
  const client = await connectPair(server);

  try {
    const { resources } = await client.listResources();
    assert.ok(resources.some((r) => r.uri === 'mentor://base'));

    const { prompts } = await client.listPrompts();
    assert.ok(prompts.some((p) => p.name === 'guided-study'));
  } finally {
    await client.close();
    await server.close();
  }
});
