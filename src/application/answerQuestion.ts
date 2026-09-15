// ============================================================================
//  AnswerQuestion — o CASO DE USO que junta o RAG inteiro (a resposta com fontes)
// ============================================================================
//
//  ONDE ISSO MORA? Numa camada NOVA: "application" (aplicação).
//    • core/       → tipos e lógica pura (models, ports, chunker, similarity).
//    • adapters/   → tecnologia concreta (ler arquivo, embeddings, LLM...).
//    • application/→ os CASOS DE USO: orquestram as peças para entregar uma
//                    funcionalidade. É o "maestro" — não toca instrumento, mas
//                    diz a ordem em que cada um toca.
//  Isso é o padrão de Arquitetura Limpa/Hexagonal: o caso de uso depende só dos
//  PORTS (interfaces), nunca das implementações. Por isso conseguimos testá-lo
//  com dublês (FakeEmbedder, FakeLLM) sem tocar em rede nem em modelo de verdade.
//
//  O FLUXO DO RAG, PASSO A PASSO (é o que o método execute faz):
//    1. RETRIEVAL:   vetoriza a pergunta → busca os chunks mais parecidos.
//    2. AUGMENTATION: monta um prompt "aterrado" (grounded) só com esse contexto.
//    3. GENERATION:  o LLM responde USANDO o contexto — e nós devolvemos, junto,
//                    as FONTES de onde a informação veio (rastreabilidade).
//
//  O CORAÇÃO DO "NÃO INVENTO":
//  O system prompt ORDENA o modelo a responder somente com base no contexto e a
//  admitir quando não sabe. E, independentemente do texto, sempre devolvemos as
//  `sources` reais dos chunks recuperados — para você poder conferir a origem.
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

/** As dependências do caso de uso — todas são PORTS (interfaces), não implementações. */
export interface AnswerQuestionDeps {
  readonly embedder: EmbedderPort;
  readonly store: VectorStorePort;
  readonly llm: LLMPort;
  readonly topK?: number; // quantos chunks recuperar (padrão: 4)
  readonly mode?: MentorMode; // postura do mentor (padrão: 'guiado')
  readonly memory?: MemoryPort; // opcional: dá memória à conversa (Etapa 8)
  readonly historyLimit?: number; // quantos turnos passados incluir (padrão: 6)
  readonly profile?: ProfilePort; // opcional: registra o perfil de estudo (Etapa 10)
  readonly maxQuestionLen?: number; // teto do tamanho da pergunta (Etapa 12)
}

// O mentor tem dois "jeitos de responder" (modos). Ambos são aterrados no
// contexto e citam as fontes — o que muda é a POSTURA pedagógica.

/** Modo DIRETO: entrega a explicação pronta (bom quando você só quer a info). */
export const SYSTEM_PROMPT_DIRETO = [
  'Você é um mentor de programação. Responda em português, de forma didática.',
  'Regras OBRIGATÓRIAS:',
  '1. Responda SOMENTE com base no CONTEXTO fornecido abaixo.',
  '2. Se a resposta não estiver no contexto, diga claramente: "Não encontrei isso na base de conhecimento." Não invente.',
  '3. Ao usar uma informação, cite o número da fonte correspondente, ex.: [1].',
].join('\n');

/**
 * Modo GUIADO (socrático): em vez de entregar tudo, o mentor te conduz — faz uma
 * pergunta, dá uma dica da fonte e te convida a tentar. Só revela se você pedir.
 * É a postura que MAIS ensina: você constrói o entendimento em vez de só receber.
 */
export const SYSTEM_PROMPT_GUIADO = [
  'Você é um mentor socrático de programação. Fale em português, com tom acolhedor e direto. Seja breve.',
  'Regras OBRIGATÓRIAS:',
  '1. Responda SOMENTE com base no CONTEXTO fornecido abaixo. Se a resposta não estiver nele, diga: "Não encontrei isso na base de conhecimento." Não invente.',
  '2. NÃO entregue a resposta pronta de imediato. Comece com UMA pergunta que faça o aluno pensar sobre o problema.',
  '3. Depois, dê UMA dica curta ancorada no contexto, citando a fonte usada (ex.: [1]) — aponte o caminho sem revelar tudo.',
  '4. Convide o aluno a tentar: peça que ele diga o que acha ou tente responder.',
  '5. EXCEÇÃO: se o aluno pedir explicitamente a resposta (ex.: "me dá a resposta", "explica logo", "estou travado"), aí sim explique de forma completa, ainda citando as fontes [n].',
].join('\n');

/** Os modos disponíveis do mentor. */
export type MentorMode = 'guiado' | 'direto';

const PROMPTS: Record<MentorMode, string> = {
  guiado: SYSTEM_PROMPT_GUIADO,
  direto: SYSTEM_PROMPT_DIRETO,
};

export class AnswerQuestion {
  // Declaramos os campos explicitamente (em vez de "parameter properties" tipo
  // `constructor(private deps...)`) porque o Node em modo strip-only NÃO aceita
  // aquele atalho — ele só remove tipos, não reescreve código.
  private readonly deps: AnswerQuestionDeps;
  private readonly topK: number;
  private readonly historyLimit: number;
  private readonly systemPrompt: string;
  private readonly maxQuestionLen?: number;

  constructor(deps: AnswerQuestionDeps) {
    this.deps = deps;
    this.topK = deps.topK ?? 4;
    this.historyLimit = deps.historyLimit ?? 6;
    this.systemPrompt = PROMPTS[deps.mode ?? 'guiado']; // padrão: socrático guiado
    this.maxQuestionLen = deps.maxQuestionLen;
  }

  /**
   * Responde a `question`. Se `sessionId` for informado E houver memória, o
   * mentor LEMBRA da conversa: injeta o histórico no prompt e grava os turnos.
   * Sem isso, funciona como antes (uma pergunta isolada).
   */
  async execute(question: string, sessionId?: string): Promise<Answer> {
    // 0. VALIDAÇÃO — recusa pergunta vazia/gigante cedo (Etapa 12) e normaliza.
    question = validateQuestion(question, this.maxQuestionLen);

    const usarMemoria = Boolean(this.deps.memory && sessionId);

    // 0. MEMÓRIA — recupera os últimos turnos da conversa (se houver).
    const history: Turn[] = usarMemoria
      ? await this.deps.memory!.history(sessionId!, this.historyLimit)
      : [];

    // 1. RETRIEVAL — vetoriza a pergunta e busca os chunks mais próximos.
    const [queryVector] = await this.deps.embedder.embed([question]);
    const context = await this.deps.store.search(queryVector, this.topK);

    // 2. AUGMENTATION — monta o prompt com o HISTÓRICO + o contexto recuperado.
    const userPrompt = buildUserPrompt(question, context, history);

    // 3. GENERATION — o LLM gera a resposta seguindo as regras do modo escolhido.
    const text = await this.deps.llm.generate(this.systemPrompt, userPrompt);

    // 4. FONTES — sempre devolvemos de onde veio o contexto (rastreabilidade).
    const sources = context.chunks.map(toSource);

    // 5. MEMÓRIA — grava o turno do aluno e o do mentor, pra lembrar depois.
    if (usarMemoria) {
      const agora = new Date().toISOString();
      await this.deps.memory!.append(sessionId!, { role: 'aluno', text: question, at: agora });
      await this.deps.memory!.append(sessionId!, { role: 'mentor', text, at: agora });
    }

    // 6. PERFIL — registra O QUE o aluno estudou (pergunta + fontes tocadas).
    //    Diferente da memória (o diálogo), o perfil é a visão agregada do estudo.
    //    Usamos a mesma identidade da sessão como "id do aluno".
    if (this.deps.profile) {
      const studentId = sessionId ?? 'default';
      const fontes = [...new Set(sources.map((s) => s.source))]; // fontes únicas
      await this.deps.profile.record(studentId, question, fontes);
    }

    return { text, sources };
  }
}

/**
 * Monta o prompt do usuário juntando a pergunta + o contexto recuperado.
 * Numeramos os trechos ([1], [2]...) para o modelo conseguir citar a fonte.
 * É uma função PURA (mesma entrada → mesma saída) → fácil de testar.
 */
export function buildUserPrompt(
  question: string,
  context: RetrievedContext,
  history: Turn[] = [],
): string {
  const partes: string[] = [];

  // HISTÓRICO (se houver) — dá continuidade ao diálogo.
  if (history.length > 0) {
    const conversa = history.map((t) => `${t.role.toUpperCase()}: ${t.text}`).join('\n');
    partes.push(`HISTÓRICO DA CONVERSA:\n${conversa}`);
  }

  // CONTEXTO recuperado da base (numerado para o modelo citar as fontes).
  if (context.chunks.length === 0) {
    partes.push('CONTEXTO: (nenhum trecho encontrado)');
  } else {
    const trechos = context.chunks
      .map((sc, i) => `[${i + 1}] (fonte: ${sourceName(sc)})\n${sc.chunk.text}`)
      .join('\n\n');
    partes.push(`CONTEXTO:\n${trechos}`);
  }

  partes.push(`PERGUNTA: ${question}`);
  return partes.join('\n\n');
}

/** Converte um ScoredChunk na Source citável (com o nome do arquivo de origem). */
function toSource(sc: ScoredChunk): Source {
  return {
    documentId: sc.chunk.documentId,
    source: sourceName(sc),
    position: sc.chunk.position,
  };
}

/** Recupera o nome da origem guardado no metadata do chunk (fallback: documentId). */
function sourceName(sc: ScoredChunk): string {
  const fromMeta = sc.chunk.metadata?.source;
  return typeof fromMeta === 'string' ? fromMeta : sc.chunk.documentId;
}
