// ============================================================================
//  AnswerQuestion — the USE CASE that ties the whole RAG together (answer + sources)
// ============================================================================
//
//  WHERE DOES THIS LIVE? In a dedicated layer: "application".
//    • core/       → types and pure logic (models, ports, chunker, similarity).
//    • adapters/   → concrete tech (reading files, embeddings, LLM...).
//    • application/→ the USE CASES: they orchestrate the pieces to deliver a
//                    feature. It's the "conductor" — plays no instrument, but
//                    decides the order in which each one plays.
//  This is the Clean/Hexagonal Architecture pattern: the use case depends only on
//  PORTS (interfaces), never on implementations. That's why we can test it with
//  doubles (FakeEmbedder, FakeLLM) without touching the network or a real model.
//
//  THE RAG FLOW, STEP BY STEP (what execute() does):
//    1. RETRIEVAL:    embed the question → fetch the most similar chunks.
//    2. AUGMENTATION: build a "grounded" prompt from that context only.
//    3. GENERATION:   the LLM answers USING the context — and we return, alongside,
//                     the SOURCES the information came from (traceability).
//
//  THE HEART OF "DON'T MAKE THINGS UP":
//  The system prompt ORDERS the model to answer only from the context and to admit
//  when it doesn't know. And, regardless of the text, we always return the real
//  `sources` of the retrieved chunks — so you can check the origin.
// ============================================================================

import type { Answer, RetrievedContext, ScoredChunk, Source, Turn } from '../core/models.ts';
import type {
  EmbedderPort,
  LLMPort,
  MemoryPort,
  ProfilePort,
  VectorStorePort,
} from '../core/ports.ts';
import { validateQuestion } from '../core/validation.ts';
import { NoopTracer, type TracerPort } from '../core/tracing.ts';
import {
  CONTEXT_CLOSE,
  CONTEXT_OPEN,
  DEFENSIVE_CLAUSE,
  FLAG_MARKER,
  detectInjection,
} from '../core/guardrails.ts';

/** The use case's dependencies — all PORTS (interfaces), not implementations. */
export interface AnswerQuestionDeps {
  readonly embedder: EmbedderPort;
  readonly store: VectorStorePort;
  readonly llm: LLMPort;
  readonly topK?: number; // how many chunks to retrieve (default: 4)
  readonly mode?: MentorMode; // mentor stance (default: 'guided')
  readonly lang?: MentorLang; // answer language (default: 'en') — Step 18
  readonly memory?: MemoryPort; // optional: gives the conversation memory (Step 8)
  readonly historyLimit?: number; // how many past turns to include (default: 6)
  readonly profile?: ProfilePort; // optional: records the study profile (Step 10)
  readonly maxQuestionLen?: number; // cap on the question length (Step 12)
  readonly tracer?: TracerPort; // optional: span-based observability (Step 13)
}

/** The mentor's available stances. */
export type MentorMode = 'guided' | 'direct';
/** The answer language (Step 18). */
export type MentorLang = 'en' | 'pt';

// The "I couldn't find it" sentence, per language. Used verbatim by the prompts.
const NOT_FOUND: Record<MentorLang, string> = {
  en: 'I could not find this in the knowledge base.',
  pt: 'Não encontrei isso na base de conhecimento.',
};

// The mentor has two "ways of answering" (modes). Both are grounded in the context
// and cite the sources — what changes is the PEDAGOGICAL stance. Each mode also
// comes in two languages (Step 18), selected by `lang`.

/** DIRECT mode: hands over the finished explanation (good when you just want the info). */
function directPrompt(lang: MentorLang): string {
  const en = [
    'You are a programming mentor. Reply in American English, in a didactic way.',
    'MANDATORY rules:',
    '1. Answer ONLY based on the CONTEXT provided below.',
    `2. If the answer is not in the context, clearly say: "${NOT_FOUND.en}" Do not make things up.`,
    '3. When you use a piece of information, cite the corresponding source number, e.g. [1].',
    DEFENSIVE_CLAUSE, // Step 14: context is data, not instructions
  ];
  const pt = [
    'Você é um mentor de programação. Responda em português, de forma didática.',
    'Regras OBRIGATÓRIAS:',
    '1. Responda SOMENTE com base no CONTEXTO fornecido abaixo.',
    `2. Se a resposta não estiver no contexto, diga claramente: "${NOT_FOUND.pt}" Não invente.`,
    '3. Ao usar uma informação, cite o número da fonte correspondente, ex.: [1].',
    DEFENSIVE_CLAUSE,
  ];
  return (lang === 'pt' ? pt : en).join('\n');
}

/**
 * GUIDED mode (Socratic): instead of handing everything over, the mentor leads you
 * — asks a question, gives a hint from the source, and invites you to try. It only
 * reveals if you ask. It's the stance that teaches MOST: you build the understanding.
 */
function guidedPrompt(lang: MentorLang): string {
  const en = [
    'You are a Socratic programming mentor. Reply in American English, with a warm, direct tone. Be brief.',
    'MANDATORY rules:',
    `1. Answer ONLY based on the CONTEXT provided below. If the answer is not there, say: "${NOT_FOUND.en}" Do not make things up.`,
    '2. Do NOT hand over the full answer right away. Start with ONE question that makes the student think about the problem.',
    '3. Then give ONE short hint anchored in the context, citing the source used (e.g. [1]) — point the way without revealing everything.',
    '4. Invite the student to try: ask them to say what they think or to attempt an answer.',
    '5. EXCEPTION: if the student explicitly asks for the answer (e.g. "just give me the answer", "explain it already", "I am stuck"), then explain fully, still citing the sources [n].',
    DEFENSIVE_CLAUSE,
  ];
  const pt = [
    'Você é um mentor socrático de programação. Fale em português, com tom acolhedor e direto. Seja breve.',
    'Regras OBRIGATÓRIAS:',
    `1. Responda SOMENTE com base no CONTEXTO fornecido abaixo. Se a resposta não estiver nele, diga: "${NOT_FOUND.pt}" Não invente.`,
    '2. NÃO entregue a resposta pronta de imediato. Comece com UMA pergunta que faça o aluno pensar sobre o problema.',
    '3. Depois, dê UMA dica curta ancorada no contexto, citando a fonte usada (ex.: [1]) — aponte o caminho sem revelar tudo.',
    '4. Convide o aluno a tentar: peça que ele diga o que acha ou tente responder.',
    '5. EXCEÇÃO: se o aluno pedir explicitamente a resposta (ex.: "me dá a resposta", "explica logo", "estou travado"), aí sim explique de forma completa, ainda citando as fontes [n].',
    DEFENSIVE_CLAUSE,
  ];
  return (lang === 'pt' ? pt : en).join('\n');
}

/** System prompts by [language][mode]. */
export const SYSTEM_PROMPTS: Record<MentorLang, Record<MentorMode, string>> = {
  en: { guided: guidedPrompt('en'), direct: directPrompt('en') },
  pt: { guided: guidedPrompt('pt'), direct: directPrompt('pt') },
};

export class AnswerQuestion {
  // We declare the fields explicitly (instead of "parameter properties" like
  // `constructor(private deps...)`) because Node in strip-only mode does NOT accept
  // that shortcut — it only removes types, it doesn't rewrite code.
  private readonly deps: AnswerQuestionDeps;
  private readonly topK: number;
  private readonly historyLimit: number;
  private readonly mode: MentorMode;
  private readonly systemPrompt: string;
  private readonly maxQuestionLen?: number;
  private readonly tracer: TracerPort;

  constructor(deps: AnswerQuestionDeps) {
    this.deps = deps;
    this.topK = deps.topK ?? 4;
    this.historyLimit = deps.historyLimit ?? 6;
    this.mode = deps.mode ?? 'guided'; // default: Socratic guided
    this.systemPrompt = SYSTEM_PROMPTS[deps.lang ?? 'en'][this.mode]; // default language: English
    this.maxQuestionLen = deps.maxQuestionLen;
    this.tracer = deps.tracer ?? new NoopTracer(); // no tracer → no observability (zero cost)
  }

  /**
   * Answers `question`. If `sessionId` is provided AND there is memory, the mentor
   * REMEMBERS the conversation: it injects the history into the prompt and records
   * the turns. Without it, it works as a single isolated question.
   */
  async execute(question: string, sessionId?: string): Promise<Answer> {
    // 0. VALIDATION — reject an empty/huge question early (Step 12) and normalize.
    question = validateQuestion(question, this.maxQuestionLen);

    const useMemory = Boolean(this.deps.memory && sessionId);

    // 0. MEMORY — fetch the last turns of the conversation (if any).
    const history: Turn[] = useMemory
      ? await this.deps.memory!.history(sessionId!, this.historyLimit)
      : [];

    // 1. RETRIEVAL — embed the question and fetch the nearest chunks.
    //    (wrapped in a span → we measure time and number of retrieved sources)
    const spanRetrieval = this.tracer.startSpan('retrieval', { topK: this.topK });
    const [queryVector] = await this.deps.embedder.embed([question]);
    const context = await this.deps.store.search(queryVector, this.topK);
    spanRetrieval.setAttribute('chunks', context.chunks.length);
    // Guardrail (Step 14): how many retrieved snippets show signs of injection?
    const suspicious = context.chunks.filter((sc) => detectInjection(sc.chunk.text).length > 0).length;
    spanRetrieval.setAttribute('suspicious', suspicious);
    spanRetrieval.end();

    // 2. AUGMENTATION — build the prompt with the HISTORY + the retrieved context.
    const userPrompt = buildUserPrompt(question, context, history);

    // 3. GENERATION — the LLM produces the answer following the chosen mode's rules.
    const spanGen = this.tracer.startSpan('generation', { mode: this.mode });
    const text = await this.deps.llm.generate(this.systemPrompt, userPrompt);
    spanGen.setAttribute('respLen', text.length);
    spanGen.end();

    // 4. SOURCES — we always return where the context came from (traceability).
    const sources = context.chunks.map(toSource);

    // 5. MEMORY — record the student's turn and the mentor's turn, to remember later.
    if (useMemory) {
      const now = new Date().toISOString();
      await this.deps.memory!.append(sessionId!, { role: 'student', text: question, at: now });
      await this.deps.memory!.append(sessionId!, { role: 'mentor', text, at: now });
    }

    // 6. PROFILE — record WHAT the student studied (question + sources touched).
    //    Unlike memory (the dialogue), the profile is the aggregate view of study.
    //    We use the same session identity as the "student id".
    if (this.deps.profile) {
      const studentId = sessionId ?? 'default';
      const uniqueSources = [...new Set(sources.map((s) => s.source))];
      await this.deps.profile.record(studentId, question, uniqueSources);
    }

    return { text, sources };
  }
}

/**
 * Builds the user prompt by joining the question + the retrieved context.
 * We number the snippets ([1], [2]...) so the model can cite the source.
 * It's a PURE function (same input → same output) → easy to test.
 */
export function buildUserPrompt(
  question: string,
  context: RetrievedContext,
  history: Turn[] = [],
): string {
  const parts: string[] = [];

  // HISTORY (if any) — gives continuity to the dialogue.
  if (history.length > 0) {
    const conversation = history.map((t) => `${t.role.toUpperCase()}: ${t.text}`).join('\n');
    parts.push(`CONVERSATION HISTORY:\n${conversation}`);
  }

  // CONTEXT retrieved from the base — DELIMITED (Step 14): everything between the
  // markers is UNTRUSTED DATA. Snippets with injection signs get a visible warning.
  if (context.chunks.length === 0) {
    parts.push(`CONTEXT:\n${CONTEXT_OPEN}\n(no snippet found)\n${CONTEXT_CLOSE}`);
  } else {
    const snippets = context.chunks
      .map((sc, i) => {
        const suspicious = detectInjection(sc.chunk.text).length > 0;
        const warning = suspicious ? `${FLAG_MARKER}\n` : '';
        return `[${i + 1}] (source: ${sourceName(sc)})\n${warning}${sc.chunk.text}`;
      })
      .join('\n\n');
    parts.push(`CONTEXT:\n${CONTEXT_OPEN}\n${snippets}\n${CONTEXT_CLOSE}`);
  }

  parts.push(`QUESTION: ${question}`);
  return parts.join('\n\n');
}

/** Converts a ScoredChunk into a citable Source (with the origin file name). */
function toSource(sc: ScoredChunk): Source {
  return {
    documentId: sc.chunk.documentId,
    source: sourceName(sc),
    position: sc.chunk.position,
  };
}

/** Gets the source name stored in the chunk metadata (fallback: documentId). */
function sourceName(sc: ScoredChunk): string {
  const fromMeta = sc.chunk.metadata?.source;
  return typeof fromMeta === 'string' ? fromMeta : sc.chunk.documentId;
}
