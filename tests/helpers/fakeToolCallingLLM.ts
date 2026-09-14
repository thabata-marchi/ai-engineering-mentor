// ============================================================================
//  FakeToolCallingLLM — dublê do ToolCallingLLMPort para testar o agente
// ============================================================================
//
//  O loop do agente depende do que o LLM "decide". Para testar de forma
//  DETERMINÍSTICA (sem rede, sem custo, sem variação), roteirizamos as respostas:
//  passamos uma FILA de ChatResults e o fake devolve um por chamada, na ordem.
//  Assim conseguimos simular "primeiro chama a tool X, depois responde o texto Y".
//
//  Ele também GUARDA as mensagens e tools recebidas em cada chamada, para o teste
//  poder inspecionar o que o agente enviou (ex.: se devolveu o resultado da tool).
// ============================================================================

import type { ChatMessage, ChatResult, ToolSpec } from '../../src/core/models.ts';
import type { ToolCallingLLMPort } from '../../src/core/ports.ts';

export class FakeToolCallingLLM implements ToolCallingLLMPort {
  public calls: { messages: ChatMessage[]; tools: ToolSpec[] }[] = [];
  private readonly roteiro: ChatResult[];
  // Resposta padrão quando o roteiro acaba: um texto final (encerra o loop).
  private readonly padrao: ChatResult;

  constructor(roteiro: ChatResult[], padrao: ChatResult = { content: 'resposta final', toolCalls: [] }) {
    this.roteiro = [...roteiro];
    this.padrao = padrao;
  }

  async chat(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatResult> {
    // Guarda uma cópia do que recebeu, para inspeção nos testes.
    this.calls.push({ messages: [...messages], tools: [...tools] });
    return this.roteiro.shift() ?? this.padrao;
  }
}
