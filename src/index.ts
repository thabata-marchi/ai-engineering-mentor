// ============================================================================
//  index.ts — a API PÚBLICA do pacote (barrel de re-exports)
// ============================================================================
//
//  Ponto único de entrada para quem instalar o pacote: em vez de importar de
//  caminhos internos (que podem mudar), a pessoa importa daqui. Ex.:
//    import { AnswerQuestion, MentorAgent, RateLimiter } from 'ai-engineering-mentor';
//
//  ⚠️ Publicamos o TypeScript direto (sem build): consumidores precisam de Node
//  >= 22.6 e da flag `--experimental-strip-types` (a mesma que usamos). Isso está
//  documentado no README/PUBLISHING. É uma escolha coerente com o "sem build" do
//  projeto de estudo.
// ============================================================================

// Núcleo: tipos e contratos.
export * from './core/models.ts';
export * from './core/ports.ts';
export { SlidingWindowChunker } from './core/chunker.ts';
export { cosineSimilarity } from './core/similarity.ts';
export { rankByCosine } from './core/ranking.ts';
export { RateLimiter, RateLimitError } from './core/rateLimiter.ts';
export { validateQuestion, ValidationError, MAX_QUESTION_LEN } from './core/validation.ts';
export { NoopTracer, InMemoryTracer, ConsoleTracer } from './core/tracing.ts';
export { scoreCase, aggregate } from './core/eval.ts';
export type { GoldenCase, CaseResult, EvalReport } from './core/eval.ts';

// Casos de uso.
export { AnswerQuestion, buildUserPrompt } from './application/answerQuestion.ts';
export type { AnswerQuestionDeps, MentorMode } from './application/answerQuestion.ts';
export { MentorAgent, SYSTEM_PROMPT_AGENTE } from './application/mentorAgent.ts';
export type { MentorAgentDeps } from './application/mentorAgent.ts';

// Adapters.
export { FileParser } from './adapters/fileParser.ts';
export { PdfParser } from './adapters/pdfParser.ts';
export { LocalEmbedder } from './adapters/localEmbedder.ts';
export { InMemoryVectorStore } from './adapters/inMemoryVectorStore.ts';
export { MongoVectorStore } from './adapters/mongoVectorStore.ts';
export { InMemoryMemory } from './adapters/inMemoryMemory.ts';
export { MongoMemory } from './adapters/mongoMemory.ts';
export { InMemoryProfile } from './adapters/inMemoryProfile.ts';
export { MongoProfile } from './adapters/mongoProfile.ts';
export { OpenRouterLLM } from './adapters/openRouterLLM.ts';
export { OpenRouterChatLLM } from './adapters/openRouterChatLLM.ts';
export { RateLimitedLLM, RateLimitedChatLLM } from './adapters/rateLimitedLLM.ts';
export { McpAgentTools } from './adapters/mcpAgentTools.ts';
export { LLMJudge, parseNota } from './adapters/llmJudge.ts';

// Servidor MCP.
export { createMentorMcpServer } from './mcp/mentorServer.ts';
