#!/usr/bin/env node
// ============================================================================
//  mcp.ts — RUN the mentor as an MCP server (STDIO transport)
// ============================================================================
//
//  This is the file that VS Code (or another MCP client) executes. It assembles
//  the real mentor and exposes it over the protocol, via standard INPUT/OUTPUT (STDIO).
//
//  ⚠️ In STDIO, stdout belongs to the PROTOCOL — that's why all setup logs go to
//  stderr (you see them in the terminal, but they don't pollute the communication).
//
//  Run directly (to test):  npm run mcp
//  In VS Code: use the .vscode/mcp.json (already included in the project).
// ============================================================================

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { createMentorMcpServer } from '../src/mcp/mentorServer.ts';
import { setupMentor } from './setup.ts';

async function main() {
  // The key is resolved by the chosen provider (LLM_PROVIDER) inside setup.
  const mentor = await setupMentor();
  const useCase = new AnswerQuestion({
    embedder: mentor.embedder,
    store: mentor.store,
    llm: mentor.llm,
    memory: mentor.memory,
    profile: mentor.profile, // <- records the study profile (Step 10)
    topK: mentor.topK,
    mode: mentor.mode,
    lang: mentor.lang,
  });

  // We pass the profile to the server too → enables the `my_progress` tool.
  const server = createMentorMcpServer(useCase, mentor.profile);
  await server.connect(new StdioServerTransport());
  console.error('🔌 Mentor MCP server up (STDIO). Waiting for the client...');

  // We do NOT call process.exit: the server must stay alive serving the client.
}

main().catch((err) => {
  console.error('\n💥 Error:', err.message);
  process.exit(1);
});
