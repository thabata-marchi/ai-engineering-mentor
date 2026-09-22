// ============================================================================
//  McpAgentTools — the agent's tools COME FROM THE MCP SERVER (Step 11)
// ============================================================================
//
//  This adapter implements AgentToolsPort by wrapping an MCP CLIENT. This is WHERE
//  "the agent consumes the MCP": it lists the tools our Step 9 server exposes
//  (`ask`, `my_progress`) and executes them OVER THE PROTOCOL.
//
//  WHY IS THIS NICE (architecture)?
//  The agent (use case) doesn't know it's MCP underneath — it only knows the
//  AgentToolsPort. We could swap for local tools, another remote MCP server, etc.,
//  without touching the agent. And the MCP server we built gains a real consumer,
//  proving its value.
//
//  CONVERSIONS WE DO HERE:
//    • MCP tool.inputSchema  → ToolSpec.parameters (the schema the LLM reads)
//    • arguments as a JSON string (as the LLM sends) → object (as MCP expects)
//    • result { content:[{type:'text',text}] } → a single string
// ============================================================================

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import type { ToolSpec } from '../core/models.ts';
import type { AgentToolsPort } from '../core/ports.ts';

export class McpAgentTools implements AgentToolsPort {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async listTools(): Promise<ToolSpec[]> {
    const { tools } = await this.client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      // The MCP inputSchema is already a JSON Schema — it's what the model needs to see.
      parameters: (t.inputSchema as Record<string, unknown>) ?? {
        type: 'object',
        properties: {},
      },
    }));
  }

  async callTool(name: string, argumentsJson: string): Promise<string> {
    // The LLM sends the arguments as a JSON STRING; MCP wants an OBJECT.
    let args: Record<string, unknown>;
    try {
      args = argumentsJson ? JSON.parse(argumentsJson) : {};
    } catch {
      // The model sent something that isn't valid JSON → we return a readable error
      // (which becomes an observation for the model to fix on the next round).
      return `Error: invalid arguments (expected JSON): ${argumentsJson}`;
    }

    const result = (await this.client.callTool({ name, arguments: args })) as {
      content?: { type: string; text?: string }[];
      isError?: boolean;
    };

    // Join the result's text blocks into a single string.
    const text = (result.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n');
    return text || '(the tool returned no text)';
  }
}
