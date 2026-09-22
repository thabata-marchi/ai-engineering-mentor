// ============================================================================
//  mentorServer — exposes the mentor as an MCP SERVER (Step 9)
// ============================================================================
//
//  WHAT IS THIS?
//  Here we "wrap" the mentor in the MCP protocol (Model Context Protocol). This
//  way, any compatible client (VS Code, Claude, an agent...) sees the mentor as a
//  set of capabilities and can invoke it on its own.
//
//  MCP has THREE kinds of capability (and we expose):
//    • TOOL      → an ACTION the model runs. Here: `ask` and, if there is a
//                  profile, `my_progress` (what the student has been studying).
//    • RESOURCE  → a DOCUMENT/context describing the service. Here: `mentor://base`.
//    • PROMPT    → a ready-made instruction TEMPLATE. Here: `guided-study`.
//
//  ARCHITECTURE DECISION:
//  This function receives the `AnswerQuestion` use case READY (dependency
//  injection). It doesn't know how to build the embedder/store/LLM — it just
//  "translates" the mentor to the protocol. That's why we can test it with a FAKE
//  mentor, with no network.
// ============================================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { AnswerQuestion } from '../application/answerQuestion.ts';
import type { ProfilePort } from '../core/ports.ts';
import { MAX_QUESTION_LEN } from '../core/validation.ts';

export function createMentorMcpServer(useCase: AnswerQuestion, profile?: ProfilePort): McpServer {
  const server = new McpServer({ name: 'ai-engineering-mentor', version: '0.2.0' });

  // ---------- TOOL: ask ----------
  server.registerTool(
    'ask',
    {
      title: 'Ask the mentor',
      description:
        'Asks the programming mentor a question. It answers grounded in the ' +
        'knowledge base (RAG), in a Socratic way, and cites the sources it used.',
      inputSchema: {
        // Edge validation (Step 12): reject empty and cap the length — zod blocks
        // it before it even reaches the use case, with a clear message.
        question: z
          .string()
          .min(1, 'The question cannot be empty.')
          .max(MAX_QUESTION_LEN, `Question too long (maximum ${MAX_QUESTION_LEN} characters).`)
          .describe("The student's question"),
        session: z
          .string()
          .max(200)
          .optional()
          .describe('Conversation id, so the mentor remembers the turns. Optional.'),
      },
    },
    async ({ question, session }) => {
      const answer = await useCase.execute(question, session);
      const sources = answer.sources
        .map((s, i) => `[${i + 1}] ${s.source} (chunk #${s.position})`)
        .join('\n');
      const text = sources ? `${answer.text}\n\n📚 Sources:\n${sources}` : answer.text;
      return { content: [{ type: 'text', text }] };
    },
  );

  // ---------- TOOL: my_progress (only when there is a profile) ----------
  // Exposes the AGGREGATE view of the student's study: how many questions they
  // asked, which sources they touched most, and the latest questions. Step 10.
  if (profile) {
    server.registerTool(
      'my_progress',
      {
        title: 'My progress',
        description:
          "Shows the student's learning profile: total questions, the most " +
          'consulted sources, and the latest questions. Use the same session id.',
        inputSchema: {
          session: z
            .string()
            .optional()
            .describe('Student/conversation id. Default: "default".'),
        },
      },
      async ({ session }) => {
        const summary = await profile.summary(session ?? 'default');
        if (summary.total === 0) {
          return { content: [{ type: 'text', text: 'No studies recorded in this session yet.' }] };
        }
        const sources = summary.bySource
          .map((f) => `- ${f.source}: ${f.count} time(s)`)
          .join('\n');
        const recent = summary.recent.map((q, i) => `${i + 1}. ${q}`).join('\n');
        const text =
          `📈 Student progress\n\n` +
          `Questions asked: ${summary.total}\n\n` +
          `Most consulted sources:\n${sources}\n\n` +
          `Recent questions:\n${recent}`;
        return { content: [{ type: 'text', text }] };
      },
    );
  }

  // ---------- RESOURCE: knowledge-base description ----------
  // Gives the client/LLM context about what the mentor does, without asking.
  server.registerResource(
    'knowledge-base',
    'mentor://base',
    {
      title: "Mentor's knowledge base",
      description: 'What the mentor knows and how to use it.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text:
            '# Software Engineering Mentor\n\n' +
            'I answer questions grounded in an own knowledge base (RAG), in a ' +
            'Socratic way (question + hint) and citing the sources.\n\n' +
            'Use the `ask` tool with your question. Pass `session` so I remember the conversation.',
        },
      ],
    }),
  );

  // ---------- PROMPT: guided study ----------
  // A ready-made "shortcut": given a topic, it generates the ideal starting instruction.
  server.registerPrompt(
    'guided-study',
    {
      title: 'Guided study',
      description: 'Generates a ready-made instruction to study a topic with the mentor.',
      argsSchema: { topic: z.string().describe('The topic you want to study') },
    },
    ({ topic }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I want to study "${topic}". Use the "ask" tool and guide me with the Socratic method, citing the sources.`,
          },
        },
      ],
    }),
  );

  return server;
}
