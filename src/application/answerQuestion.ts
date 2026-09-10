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

import type { Answer, RetrievedContext, ScoredChunk, Source } from '../core/models.ts';
import type { EmbedderPort, LLMPort, VectorStorePort } from '../core/ports.ts';

/** As dependências do caso de uso — todas são PORTS (interfaces), não implementações. */
export interface AnswerQuestionDeps {
  readonly embedder: EmbedderPort;
  readonly store: VectorStorePort;
  readonly llm: LLMPort;
  readonly topK?: number; // quantos chunks recuperar (padrão: 4)
  readonly mode?: MentorMode; // postura do mentor (padrão: 'guiado')
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
  private readonly systemPrompt: string;

  constructor(deps: AnswerQuestionDeps) {
    this.deps = deps;
    this.topK = deps.topK ?? 4;
    this.systemPrompt = PROMPTS[deps.mode ?? 'guiado']; // padrão: socrático guiado
  }

  async execute(question: string): Promise<Answer> {
    // 1. RETRIEVAL — vetoriza a pergunta e busca os chunks mais próximos.
    const [queryVector] = await this.deps.embedder.embed([question]);
    const context = await this.deps.store.search(queryVector, this.topK);

    // 2. AUGMENTATION — monta o prompt do usuário "aterrado" no contexto.
    const userPrompt = buildUserPrompt(question, context);

    // 3. GENERATION — o LLM gera a resposta seguindo as regras do modo escolhido.
    const text = await this.deps.llm.generate(this.systemPrompt, userPrompt);

    // 4. FONTES — sempre devolvemos de onde veio o contexto (rastreabilidade).
    const sources = context.chunks.map(toSource);

    return { text, sources };
  }
}

/**
 * Monta o prompt do usuário juntando a pergunta + o contexto recuperado.
 * Numeramos os trechos ([1], [2]...) para o modelo conseguir citar a fonte.
 * É uma função PURA (mesma entrada → mesma saída) → fácil de testar.
 */
export function buildUserPrompt(question: string, context: RetrievedContext): string {
  if (context.chunks.length === 0) {
    return `CONTEXTO: (nenhum trecho encontrado)\n\nPERGUNTA: ${question}`;
  }

  const trechos = context.chunks
    .map((sc, i) => {
      const origem = sourceName(sc);
      return `[${i + 1}] (fonte: ${origem})\n${sc.chunk.text}`;
    })
    .join('\n\n');

  return `CONTEXTO:\n${trechos}\n\nPERGUNTA: ${question}`;
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
