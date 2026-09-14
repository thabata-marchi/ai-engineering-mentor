// ============================================================================
//  MentorAgent — o AGENTE autônomo (Etapa 11): o loop ReAct
// ============================================================================
//
//  O QUE MUDA EM RELAÇÃO AO RAG?
//  No RAG (AnswerQuestion) NÓS decidimos o fluxo: busca → prompt → resposta. No
//  AGENTE, quem decide é o MODELO: damos um OBJETIVO + a lista de tools, e ele
//  escolhe qual chamar, com quais argumentos, quantas vezes, até concluir.
//
//  O LOOP ReAct (Reason → Act → Observe), que é o que `run()` faz:
//    1. Mandamos o histórico + as tools ao LLM.               (Reason)
//    2. Se ele pediu tools, executamos cada uma.              (Act)
//    3. Devolvemos os resultados como mensagens 'tool'.       (Observe)
//    4. Repetimos. Quando o LLM responde SEM pedir tools, essa é a resposta final.
//  Um TETO de iterações (maxSteps) evita loop infinito se o modelo nunca parar.
//
//  DECISÃO DE ARQUITETURA:
//  O agente depende só de PORTS: `ToolCallingLLMPort` (o cérebro) e
//  `AgentToolsPort` (as mãos — no nosso caso, o MCP). Não sabe de rede nem de
//  MCP → testamos o loop inteiro com dublês, de forma determinística.
//
//  RASTREABILIDADE ("não invento"): devolvemos o `steps` — o passo a passo real
//  de quais tools o agente chamou e o que elas responderam.
// ============================================================================

import type { AgentResult, AgentStep, ChatMessage } from '../core/models.ts';
import type { AgentToolsPort, ToolCallingLLMPort } from '../core/ports.ts';

/** Instrução base do agente: como se comportar e quando parar. */
export const SYSTEM_PROMPT_AGENTE = [
  'Você é um agente mentor de estudos de engenharia de software.',
  'Você tem ferramentas (tools) para agir. Use-as para cumprir o objetivo do aluno.',
  'Regras:',
  '1. Use a tool "perguntar" para consultar a base de conhecimento (RAG) — ela cita as fontes.',
  '2. Se precisar saber o que o aluno já estudou, use a tool "meu_progresso".',
  '3. Baseie-se SOMENTE no que as tools retornarem. Não invente. Cite as fontes que vierem.',
  '4. Quando tiver o suficiente para responder ao objetivo, escreva a resposta final SEM chamar mais tools.',
].join('\n');

export interface MentorAgentDeps {
  readonly llm: ToolCallingLLMPort; // o cérebro (decide as tools)
  readonly tools: AgentToolsPort; // as mãos (executa — no nosso caso, via MCP)
  readonly maxSteps?: number; // teto de iterações do loop (padrão: 6)
  readonly systemPrompt?: string; // permite customizar a instrução base
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

  /** Roda o agente até ele produzir a resposta final (ou bater o teto de passos). */
  async run(objetivo: string): Promise<AgentResult> {
    const toolSpecs = await this.tools.listTools();
    const steps: AgentStep[] = [];

    // O diálogo com o modelo começa com a instrução base + o objetivo do aluno.
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: objetivo },
    ];

    for (let passo = 0; passo < this.maxSteps; passo++) {
      const result = await this.llm.chat(messages, toolSpecs);

      // Sem pedidos de tool → o modelo deu a RESPOSTA FINAL. Encerra.
      if (result.toolCalls.length === 0) {
        return { answer: result.content, steps, stoppedByLimit: false };
      }

      // O modelo PEDIU tools: registramos a mensagem do assistant com os pedidos...
      messages.push({ role: 'assistant', content: result.content, toolCalls: result.toolCalls });

      // ...executamos cada tool e devolvemos o resultado como mensagem 'tool'.
      for (const call of result.toolCalls) {
        const resultado = await this.tools.callTool(call.name, call.arguments);
        steps.push({ tool: call.name, arguments: call.arguments, result: resultado });
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: resultado });
      }
    }

    // Bateu o teto sem concluir: fazemos uma última chamada SEM tools, forçando
    // o modelo a resumir o que já tem em vez de devolver algo vazio.
    const fechamento = await this.llm.chat(
      [
        ...messages,
        {
          role: 'user',
          content:
            'Você atingiu o limite de passos. Responda agora ao objetivo com o que já reuniu, sem chamar mais tools.',
        },
      ],
      [], // sem tools nesta última rodada
    );
    return { answer: fechamento.content, steps, stoppedByLimit: true };
  }
}
