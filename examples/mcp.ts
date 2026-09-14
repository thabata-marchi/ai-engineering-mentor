// ============================================================================
//  mcp.ts — RODAR o mentor como servidor MCP (transporte STDIO)
// ============================================================================
//
//  É este arquivo que o VSCode (ou outro cliente MCP) executa. Ele monta o
//  mentor de verdade e o expõe pelo protocolo, via ENTRADA/SAÍDA padrão (STDIO).
//
//  ⚠️ No STDIO, o stdout é do PROTOCOLO — por isso todos os logs do setup vão
//  para o stderr (você os vê no terminal, mas eles não sujam a comunicação).
//
//  Rodar direto (pra testar):  npm run mcp
//  No VSCode: use o .vscode/mcp.json (já incluído no projeto).
// ============================================================================

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { createMentorMcpServer } from '../src/mcp/mentorServer.ts';
import { setupMentor } from './setup.ts';

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('❌ Defina OPENROUTER_API_KEY. Crie uma em https://openrouter.ai/keys');
    process.exit(1);
  }

  const mentor = await setupMentor(apiKey);
  const useCase = new AnswerQuestion({
    embedder: mentor.embedder,
    store: mentor.store,
    llm: mentor.llm,
    memory: mentor.memory,
    profile: mentor.profile, // <- registra o perfil de estudo (Etapa 10)
    topK: mentor.topK,
    mode: mentor.mode,
  });

  // Passamos o perfil também ao servidor → habilita a tool `meu_progresso`.
  const server = createMentorMcpServer(useCase, mentor.profile);
  await server.connect(new StdioServerTransport());
  console.error('🔌 Servidor MCP do mentor no ar (STDIO). Aguardando o cliente...');

  // NÃO chamamos process.exit: o servidor precisa continuar vivo atendendo o cliente.
}

main().catch((err) => {
  console.error('\n💥 Erro:', err.message);
  process.exit(1);
});
