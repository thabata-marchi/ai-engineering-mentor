// Testes do agente (Etapa 11): o loop ReAct com um LLM de tool-calling FALSO
// (roteirizado) + o McpAgentTools contra o servidor MCP REAL (transporte em
// memória). Tudo determinístico, sem rede.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { MentorAgent } from '../src/application/mentorAgent.ts';
import { McpAgentTools } from '../src/adapters/mcpAgentTools.ts';
import { createMentorMcpServer } from '../src/mcp/mentorServer.ts';
import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { InMemoryVectorStore } from '../src/adapters/inMemoryVectorStore.ts';
import { InMemoryProfile } from '../src/adapters/inMemoryProfile.ts';
import { SlidingWindowChunker } from '../src/core/chunker.ts';
import type { AgentToolsPort } from '../src/core/ports.ts';
import type { Document, ToolSpec } from '../src/core/models.ts';
import { FakeEmbedder } from './helpers/fakeEmbedder.ts';
import { FakeLLM } from './helpers/fakeLLM.ts';
import { FakeToolCallingLLM } from './helpers/fakeToolCallingLLM.ts';

/** Um provedor de tools falso: registra as chamadas e devolve um resultado fixo. */
class FakeTools implements AgentToolsPort {
  public chamadas: { name: string; args: string }[] = [];
  private readonly resultado: string;
  constructor(resultado = 'resultado da tool') {
    this.resultado = resultado;
  }
  async listTools(): Promise<ToolSpec[]> {
    return [{ name: 'perguntar', description: 'consulta a base', parameters: { type: 'object' } }];
  }
  async callTool(name: string, argumentsJson: string): Promise<string> {
    this.chamadas.push({ name, args: argumentsJson });
    return this.resultado;
  }
}

test('agente: chama a tool, observa o resultado e então responde (loop ReAct)', async () => {
  const tools = new FakeTools('SRP: uma classe, um motivo para mudar [1]');
  // Roteiro: 1ª rodada pede a tool "perguntar"; 2ª rodada dá a resposta final.
  const llm = new FakeToolCallingLLM([
    { content: '', toolCalls: [{ id: 'c1', name: 'perguntar', arguments: '{"pergunta":"o que é SRP?"}' }] },
    { content: 'Em resumo, SRP é... [1]', toolCalls: [] },
  ]);
  const agent = new MentorAgent({ llm, tools });

  const res = await agent.run('me ajude a entender SRP');

  assert.equal(res.answer, 'Em resumo, SRP é... [1]');
  assert.equal(res.stoppedByLimit, false);
  // Executou a tool pedida, com os argumentos do modelo.
  assert.deepEqual(tools.chamadas, [{ name: 'perguntar', args: '{"pergunta":"o que é SRP?"}' }]);
  // O trace registra o passo.
  assert.equal(res.steps.length, 1);
  assert.equal(res.steps[0].tool, 'perguntar');
  // Na 2ª chamada ao LLM, o resultado da tool foi devolvido como mensagem 'tool'.
  const msgs2 = llm.calls[1].messages;
  assert.ok(msgs2.some((m) => m.role === 'tool' && m.content.includes('SRP: uma classe')));
});

test('agente: respeita o teto de passos e marca stoppedByLimit', async () => {
  const tools = new FakeTools();
  // LLM "teimoso": SEMPRE pede tool → nunca conclui sozinho.
  const semprePedeTool = {
    content: '',
    toolCalls: [{ id: 'x', name: 'perguntar', arguments: '{}' }],
  };
  const llm = new FakeToolCallingLLM(
    [semprePedeTool, semprePedeTool], // maxSteps=2 → 2 rodadas com tool
    semprePedeTool, // e continuaria pedindo (mas o loop para no teto)
  );
  const agent = new MentorAgent({ llm, tools, maxSteps: 2 });

  const res = await agent.run('objetivo qualquer');

  assert.equal(res.stoppedByLimit, true);
  assert.equal(res.steps.length, 2); // executou 2 vezes (o teto)
});

test('McpAgentTools: lista e executa as tools do servidor MCP real', async () => {
  // Monta um mentor falso e o expõe como servidor MCP (com perfil → 2 tools).
  const embedder = new FakeEmbedder();
  const store = new InMemoryVectorStore();
  const chunker = new SlidingWindowChunker({ chunkSizeWords: 60, overlapWords: 10 });
  const doc: Document = { id: 'srp', source: 'srp.md', text: 'single responsibility principle' };
  await store.add(chunker.chunk(doc), await embedder.embed([doc.text]));
  const profile = new InMemoryProfile();
  const useCase = new AnswerQuestion({ embedder, store, llm: new FakeLLM('resposta MCP'), profile, topK: 1 });
  const server = createMentorMcpServer(useCase, profile);

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'teste', version: '1.0.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);

  try {
    const tools = new McpAgentTools(client);
    const specs = await tools.listTools();
    // As tools do servidor viram ToolSpecs com schema (parameters).
    assert.ok(specs.some((t) => t.name === 'perguntar'));
    assert.ok(specs.some((t) => t.name === 'meu_progresso'));
    const perguntar = specs.find((t) => t.name === 'perguntar')!;
    assert.equal(typeof perguntar.parameters, 'object');

    // Executa a tool via protocolo e recebe o texto.
    const texto = await tools.callTool('perguntar', '{"pergunta":"o que é SRP?"}');
    assert.match(texto, /resposta MCP/);
  } finally {
    await client.close();
    await server.close();
  }
});

test('agente end-to-end: usa o MCP real como ferramenta (LLM roteirizado)', async () => {
  const embedder = new FakeEmbedder();
  const store = new InMemoryVectorStore();
  const chunker = new SlidingWindowChunker({ chunkSizeWords: 60, overlapWords: 10 });
  const doc: Document = { id: 'srp', source: 'srp.md', text: 'single responsibility principle' };
  await store.add(chunker.chunk(doc), await embedder.embed([doc.text]));
  const useCase = new AnswerQuestion({ embedder, store, llm: new FakeLLM('SRP explicado'), topK: 1 });
  const server = createMentorMcpServer(useCase);

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'teste', version: '1.0.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);

  try {
    const tools = new McpAgentTools(client);
    const llm = new FakeToolCallingLLM([
      { content: '', toolCalls: [{ id: 'c1', name: 'perguntar', arguments: '{"pergunta":"SRP?"}' }] },
      { content: 'Resposta final do agente', toolCalls: [] },
    ]);
    const agent = new MentorAgent({ llm, tools });

    const res = await agent.run('estudar SRP');
    assert.equal(res.answer, 'Resposta final do agente');
    assert.equal(res.steps.length, 1);
    assert.match(res.steps[0].result, /SRP explicado/); // veio do MCP real
  } finally {
    await client.close();
    await server.close();
  }
});
