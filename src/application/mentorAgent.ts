// ============================================================================
//  MentorAgent — the autonomous AGENT (Step 11): the ReAct loop
// ============================================================================
//
//  WHAT CHANGES VERSUS THE RAG?
//  In the RAG (AnswerQuestion) WE decide the flow: search → prompt → answer. In the
//  AGENT, the MODEL decides: we give a GOAL + the list of tools, and it chooses which
//  to call, with which arguments, how many times, until it's done.
//
//  THE ReAct LOOP (Reason → Act → Observe), which is what `run()` does:
//    1. We send the history + the tools to the LLM.           (Reason)
//    2. If it requested tools, we execute each one.           (Act)
//    3. We return the results as 'tool' messages.             (Observe)
//    4. Repeat. When the LLM answers WITHOUT requesting tools, that's the final answer.
//  An iteration CAP (maxSteps) prevents an infinite loop if the model never stops.
//
//  ARCHITECTURE DECISION:
//  The agent depends only on PORTS: `ToolCallingLLMPort` (the brain) and
//  `AgentToolsPort` (the hands — in our case, MCP). It knows nothing about the
//  network or MCP → we test the whole loop with doubles, deterministically.
//
//  TRACEABILITY ("don't make things up"): we return `steps` — the real step-by-step
//  of which tools the agent called and what they answered.
// ============================================================================

import type { AgentResult, AgentStep, ChatMessage } from '../core/models.ts';
import type { AgentToolsPort, ToolCallingLLMPort } from '../core/ports.ts';

/** The agent's base instruction: how to behave and when to stop. */
export const SYSTEM_PROMPT_AGENTE = [
  'You are a mentor agent for software engineering study.',
  "You have tools to act with. Use them to fulfill the student's goal.",
  'Rules:',
  '1. Use the "ask" tool to query the knowledge base (RAG) — it cites the sources.',
  '2. If you need to know what the student has already studied, use the "my_progress" tool.',
  '3. Rely ONLY on what the tools return. Do not make things up. Cite the sources that come back.',
  '4. When you have enough to answer the goal, write the final answer WITHOUT calling more tools.',
].join('\n');

export interface MentorAgentDeps {
  readonly llm: ToolCallingLLMPort; // the brain (decides the tools)
  readonly tools: AgentToolsPort; // the hands (executes — in our case, via MCP)
  readonly maxSteps?: number; // loop iteration cap (default: 6)
  readonly systemPrompt?: string; // allows customizing the base instruction
}

export class MentorAgent {
  private readonly llm: ToolCallingLLMPort;
  private readonly tools: AgentToolsPort;
  private readonly maxSteps: number;
  private readonly systemPrompt: string;

  constructor(deps: MentorAgentDeps) {
    this.llm = deps.llm;
    this.tools = deps.tools;
    this.maxSteps = deps.maxSteps ?? 6;
    this.systemPrompt = deps.systemPrompt ?? SYSTEM_PROMPT_AGENTE;
  }

  /** Runs the agent until it produces the final answer (or hits the step cap). */
  async run(goal: string): Promise<AgentResult> {
    const toolSpecs = await this.tools.listTools();
    const steps: AgentStep[] = [];

    // The dialogue with the model starts with the base instruction + the student's goal.
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: goal },
    ];

    for (let step = 0; step < this.maxSteps; step++) {
      const result = await this.llm.chat(messages, toolSpecs);

      // No tool requests → the model gave the FINAL ANSWER. Done.
      if (result.toolCalls.length === 0) {
        return { answer: result.content, steps, stoppedByLimit: false };
      }

      // The model REQUESTED tools: we record the assistant message with the requests...
      messages.push({ role: 'assistant', content: result.content, toolCalls: result.toolCalls });

      // ...we execute each tool and return the result as a 'tool' message.
      for (const call of result.toolCalls) {
        const toolResult = await this.tools.callTool(call.name, call.arguments);
        steps.push({ tool: call.name, arguments: call.arguments, result: toolResult });
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: toolResult });
      }
    }

    // Hit the cap without finishing: we make one last call WITHOUT tools, forcing the
    // model to summarize what it already has instead of returning something empty.
    const closing = await this.llm.chat(
      [
        ...messages,
        {
          role: 'user',
          content:
            'You have reached the step limit. Answer the goal now with what you already gathered, without calling more tools.',
        },
      ],
      [], // no tools in this final round
    );
    return { answer: closing.content, steps, stoppedByLimit: true };
  }
}
