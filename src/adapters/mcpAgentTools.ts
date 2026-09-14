// ============================================================================
//  McpAgentTools — as ferramentas do agente VÊM DO SERVIDOR MCP (Etapa 11)
// ============================================================================
//
//  Este adapter implementa o AgentToolsPort embrulhando um CLIENTE MCP. É AQUI
//  que "o agente consome o MCP": ele lista as tools que o nosso servidor da
//  Etapa 9 expõe (`perguntar`, `meu_progresso`) e as executa PELO PROTOCOLO.
//
//  POR QUE ISSO É LEGAL (arquitetura)?
//  O agente (caso de uso) não sabe que por baixo é MCP — ele só conhece o
//  AgentToolsPort. Poderíamos trocar por tools locais, por outro servidor MCP
//  remoto, etc., sem tocar no agente. E o servidor MCP que construímos ganha um
//  consumidor real, provando seu valor.
//
//  CONVERSÕES QUE FAZEMOS AQUI:
//    • MCP tool.inputSchema  → ToolSpec.parameters (o schema que o LLM lê)
//    • arguments em JSON-string (como o LLM manda) → objeto (como o MCP espera)
//    • resultado { content:[{type:'text',text}] } → uma string única
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
      // inputSchema do MCP já é um JSON Schema — é o que o modelo precisa ver.
      parameters: (t.inputSchema as Record<string, unknown>) ?? {
        type: 'object',
        properties: {},
      },
    }));
  }

  async callTool(name: string, argumentsJson: string): Promise<string> {
    // O LLM manda os argumentos como STRING JSON; o MCP quer um OBJETO.
    let args: Record<string, unknown>;
    try {
      args = argumentsJson ? JSON.parse(argumentsJson) : {};
    } catch {
      // Modelo mandou algo que não é JSON válido → devolvemos um erro legível
      // (que vira observação para o modelo se corrigir na próxima rodada).
      return `Erro: argumentos inválidos (esperava JSON): ${argumentsJson}`;
    }

    const result = (await this.client.callTool({ name, arguments: args })) as {
      content?: { type: string; text?: string }[];
      isError?: boolean;
    };

    // Junta os blocos de texto do resultado numa string só.
    const texto = (result.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n');
    return texto || '(a tool não devolveu texto)';
  }
}
