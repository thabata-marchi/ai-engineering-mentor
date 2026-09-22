// ============================================================================
//  agent.ts — RODAR o AGENTE autônomo (Etapa 11)
// ============================================================================
//
//  Junta tudo: monta o mentor (RAG + perfil), o expõe como servidor MCP, conecta
//  um CLIENTE MCP a ele (transporte EM MEMÓRIA, mesmo processo) e entrega essas
//  tools a um AGENTE. Você dá um OBJETIVO e o agente decide sozinho quais tools
//  chamar até responder — citando o passo a passo real (rastreabilidade).
//
//  "O agente consome o MCP": as ferramentas dele são, literalmente, as tools do
//  servidor MCP da Etapa 9 (`perguntar`, `meu_progresso`).
//
//  Rodar:   npm run agent -- "seu objetivo de estudo"
//  Exemplo: npm run agent -- "me ajude a entender o Extrair Função"
//
//  ⚠️ Precisa de um modelo com TOOL-CALLING confiável. Defina um em
//  OPENROUTER_MODEL (veja o README, Etapa 11). Se o modelo não suportar tools,
//  o agente responde direto (sem passos) — o comportamento fica visível.
// ============================================================================

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { MentorAgent } from '../src/application/mentorAgent.ts';
import { McpAgentTools } from '../src/adapters/mcpAgentTools.ts';
import { createChatLLMFromEnv } from '../src/adapters/llmFactory.ts';
import { RateLimitedChatLLM } from '../src/adapters/rateLimitedLLM.ts';
import { createMentorMcpServer } from '../src/mcp/mentorServer.ts';
import { setupMentor } from './setup.ts';

async function main() {
  const objetivo = process.argv.slice(2).join(' ').trim();
  if (!objetivo) {
    console.error('Uso: npm run agent -- "seu objetivo de estudo"');
    process.exit(1);
  }

  // 1. Monta o mentor (RAG + perfil) e o expõe como servidor MCP.
  const mentor = await setupMentor();
  const useCase = new AnswerQuestion({
    embedder: mentor.embedder,
    store: mentor.store,
    llm: mentor.llm,
    memory: mentor.memory,
    profile: mentor.profile,
    topK: mentor.topK,
    mode: mentor.mode,
    lang: mentor.lang,
  });
  const server = createMentorMcpServer(useCase, mentor.profile);

  // 2. Conecta um CLIENTE MCP ao servidor (em memória, mesmo processo).
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'mentor-agent', version: '0.1.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);

  // 3. O agente: cérebro = LLM com tool-calling (multi-provedor, Etapa 17); mãos =
  //    as tools do MCP. O provedor vem de LLM_PROVIDER — o mesmo do RAG.
  //    ⚠️ o modelo escolhido PRECISA suportar tool-calling.
  const timeoutMs = process.env.LLM_TIMEOUT_MS ? Number(process.env.LLM_TIMEOUT_MS) : 120_000;
  const { llm: rawChat, provider, model } = createChatLLMFromEnv(timeoutMs);
  console.error(`🧠 Agente usando: ${provider} | ${model}`);
  // Mesmo RateLimiter do setup: o agente pode chamar o LLM várias vezes no loop,
  // então o rate limit é ainda mais importante aqui (protege a cota).
  const chatLLM = new RateLimitedChatLLM(rawChat, mentor.limiter);
  const agent = new MentorAgent({ llm: chatLLM, tools: new McpAgentTools(client) });

  console.error(`🎯 Objetivo: ${objetivo}\n🤖 Agente pensando (pode chamar tools várias vezes)...\n`);

  try {
    const res = await agent.run(objetivo);

    // Mostra o passo a passo (o que o agente FEZ) — rastreabilidade.
    if (res.steps.length > 0) {
      console.log('🧭 Passos do agente:');
      res.steps.forEach((s, i) => {
        const resumo = s.result.length > 160 ? s.result.slice(0, 160) + '…' : s.result;
        console.log(`  ${i + 1}. ${s.tool}(${s.arguments}) → ${resumo}`);
      });
      console.log('');
    } else {
      console.log('ℹ️  O agente respondeu sem usar tools (o modelo pode não suportar tool-calling).\n');
    }

    console.log(`💬 Resposta final:\n${res.answer}`);
    if (res.stoppedByLimit) {
      console.log('\n⚠️  (parou por atingir o limite de passos)');
    }
  } finally {
    await client.close();
    await server.close();
    await mentor.cleanup();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n💥 Erro:', err.message);
    process.exit(1);
  });
