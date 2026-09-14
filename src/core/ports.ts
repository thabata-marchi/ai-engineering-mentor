// ============================================================================
//  PORTS (contratos / interfaces) do núcleo — as "tomadas" do sistema
// ============================================================================
//
//  O QUE É UM "PORT"?
//  É um CONTRATO: diz O QUE uma peça precisa fazer, sem dizer COMO. Ex.: o
//  `EmbedderPort` diz "eu recebo textos e devolvo vetores" — mas NÃO diz se
//  isso é feito pela OpenAI ou por um modelo local. Quem decide o "como" são
//  os ADAPTERS (em src/adapters/), que "plugam" nestas tomadas.
//
//  POR QUE ISSO IMPORTA? (Arquitetura Hexagonal + o "D" do SOLID)
//  O núcleo depende só destas interfaces (abstrações), nunca de uma tecnologia
//  concreta. Resultado prático:
//    • trocar o LLM ou o banco = trocar 1 adapter, sem tocar na lógica;
//    • testar o núcleo com "dublês" (fakes) que implementam o mesmo contrato.
//  Isso é a Inversão de Dependência — o "D" do SOLID.
//
//  POR QUE OS MÉTODOS RETORNAM Promise?
//  Porque em Node, ler arquivo, gerar embedding e chamar o LLM são operações
//  ASSÍNCRONAS (esperam disco/rede). `Promise<T>` = "eu te entrego um T, mas
//  daqui a pouco". Quem chama usa `await` para esperar o resultado.
// ============================================================================

import type {
  ChatMessage,
  ChatResult,
  Chunk,
  Document,
  ProfileSummary,
  RetrievedContext,
  ToolSpec,
  Turn,
} from './models.ts';

/** Lê um arquivo (PDF/MD/txt) e devolve um Document (texto + metadados). */
export interface DocumentParserPort {
  parse(path: string): Promise<Document>;
}

/** Quebra um Document em vários Chunks. (é puro/síncrono → fácil de testar) */
export interface ChunkerPort {
  chunk(document: Document): Chunk[];
}

/** Transforma textos em vetores (embeddings) — a "impressão digital" numérica do texto. */
export interface EmbedderPort {
  embed(texts: string[]): Promise<number[][]>; // 1 vetor de números por texto
}

/** Guarda os chunks vetorizados e busca os mais parecidos com a pergunta. */
export interface VectorStorePort {
  add(chunks: Chunk[], embeddings: number[][]): Promise<void>; // indexar (guardar)
  search(queryEmbedding: number[], k: number): Promise<RetrievedContext>; // buscar top-k
}

/** Recebe um prompt (regras + pergunta) e devolve o texto gerado pelo modelo. */
export interface LLMPort {
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
}

/**
 * Guarda e recupera o histórico da conversa (a MEMÓRIA do mentor). É graças a
 * ela que o diálogo tem continuidade: o mentor lembra do que já foi dito.
 * Como é um PORT, dá pra guardar em memória (testes) ou no Mongo (persistente).
 */
export interface MemoryPort {
  append(sessionId: string, turn: Turn): Promise<void>; // adiciona um turno
  history(sessionId: string, limit?: number): Promise<Turn[]>; // últimos turnos (em ordem)
}

/**
 * Registra e resume o PERFIL DE APRENDIZADO do aluno: o que ele já perguntou e
 * quais fontes foram tocadas. Diferente da memória (que guarda o diálogo turno a
 * turno pra dar continuidade), o perfil é uma visão AGREGADA — serve pra saber
 * "no que o aluno vem estudando / onde ele mais busca". Como é um PORT, pode
 * viver em memória (testes) ou no Mongo (persistente), sem tocar no núcleo.
 */
export interface ProfilePort {
  record(studentId: string, question: string, sources: string[]): Promise<void>; // registra 1 estudo
  summary(studentId: string): Promise<ProfileSummary>; // devolve o resumo agregado
}

/**
 * LLM com suporte a TOOL-CALLING (Etapa 11 — o agente). É um contrato SEPARADO
 * do LLMPort de propósito: o RAG só precisa de `generate(system, user)`, então
 * não faz sentido obrigá-lo a saber de tools (isso é o "I" do SOLID — segregação
 * de interfaces). Quem precisar de autonomia usa este port mais rico.
 *
 * Recebe o diálogo (mensagens) + a lista de tools disponíveis; devolve OU um
 * texto final OU pedidos para chamar tools (o modelo decide).
 */
export interface ToolCallingLLMPort {
  chat(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatResult>;
}

/**
 * A fonte de FERRAMENTAS do agente. No nosso caso, o adapter concreto embrulha
 * um CLIENTE MCP: o agente "consome o MCP" que construímos na Etapa 9 — lista as
 * tools (`perguntar`, `meu_progresso`) e as executa pelo protocolo. Como é um
 * PORT, o agente não sabe que por baixo é MCP → dá pra testar com um dublê.
 */
export interface AgentToolsPort {
  listTools(): Promise<ToolSpec[]>; // quais tools existem (para o modelo escolher)
  callTool(name: string, argumentsJson: string): Promise<string>; // executa e devolve o texto
}
