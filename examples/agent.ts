// ============================================================================
//  agent.ts — RUN the autonomous AGENT (Step 11)
// ============================================================================
//
//  It ties everything together: assembles the mentor (RAG + profile), exposes it as
//  an MCP server, connects an MCP CLIENT to it (IN-MEMORY transport, same process)
//  and hands those tools to an AGENT. You give a GOAL and the agent decides on its
//  own which tools to call until it answers — citing the real step-by-step
//  (traceability).
//
//  "The agent consumes the MCP": its tools are, literally, the tools of the Step 9
//  MCP server (`ask`, `my_progress`).
//
//  Run:      npm run agent -- "your study goal"
//  Example:  npm run agent -- "help me understand Extract Function"
//
//  ⚠️ Needs a model with reliable TOOL-CALLING. Set one in LLM_MODEL (see the
//  README, Step 17). If the model doesn't support tools, the agent answers directly
//  (no steps) — the behavior stays visible.
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
  const goal = process.argv.slice(2).join(' ').trim();
  if (!goal) {
    console.error('Usage: npm run agent -- "your study goal"');
    process.exit(1);
  }

  // 1. Assemble the mentor (RAG + profile) and expose it as an MCP server.
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

  // 2. Connect an MCP CLIENT to the server (in memory, same process).
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'mentor-agent', version: '0.2.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);

  // 3. The agent: brain = tool-calling LLM (multi-provider, Step 17); hands = the
  //    MCP tools. The provider comes from LLM_PROVIDER — the same as the RAG.
  //    ⚠️ the chosen model MUST support tool-calling.
  const timeoutMs = process.env.LLM_TIMEOUT_MS ? Number(process.env.LLM_TIMEOUT_MS) : 120_000;
  const { llm: rawChat, provider, model } = createChatLLMFromEnv(timeoutMs);
  console.error(`🧠 Agent using: ${provider} | ${model}`);
  // Same RateLimiter as setup: the agent may call the LLM several times in the loop,
  // so the rate limit is even more important here (protects the quota).
  const chatLLM = new RateLimitedChatLLM(rawChat, mentor.limiter);
  const agent = new MentorAgent({ llm: chatLLM, tools: new McpAgentTools(client) });

  console.error(`🎯 Goal: ${goal}\n🤖 Agent thinking (it may call tools several times)...\n`);

  try {
    const res = await agent.run(goal);

    // Show the step-by-step (what the agent DID) — traceability.
    if (res.steps.length > 0) {
      console.log('🧭 Agent steps:');
      res.steps.forEach((s, i) => {
        const preview = s.result.length > 160 ? s.result.slice(0, 160) + '…' : s.result;
        console.log(`  ${i + 1}. ${s.tool}(${s.arguments}) → ${preview}`);
      });
      console.log('');
    } else {
      console.log('ℹ️  The agent answered without using tools (the model may not support tool-calling).\n');
    }

    console.log(`💬 Final answer:\n${res.answer}`);
    if (res.stoppedByLimit) {
      console.log('\n⚠️  (stopped after reaching the step limit)');
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
    console.error('\n💥 Error:', err.message);
    process.exit(1);
  });
