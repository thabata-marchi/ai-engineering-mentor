// ============================================================================
//  MODELOS DO NÚCLEO (core) — as "peças de dado" do RAG
// ============================================================================
//
//  O QUE É ESTE ARQUIVO?
//  Aqui ficam apenas os TIPOS de dados que circulam pelo sistema. Nada de lógica,
//  nada de LLM, nada de banco. São como "peças de lego" que os outros módulos
//  vão usar para montar as funcionalidades.
//
//  POR QUE FICAM SEPARADOS E SEM DEPENDÊNCIA EXTERNA?
//  Porque este é o NÚCLEO da Arquitetura Hexagonal. O núcleo não sabe (nem
//  precisa saber) se o LLM é OpenAI ou se o banco é Chroma. Mantê-lo "puro"
//  deixa tudo fácil de testar e permite trocar de tecnologia sem mexer aqui.
//
//  ONDE CADA TIPO APARECE NO FLUXO DO RAG:
//
//    Arquivo → [Document] → [Chunk]s → (viram vetores) → guardados no banco
//                                                                │
//    Pergunta → [Query] → busca por similaridade → [RetrievedContext]
//                                                                │
//                                     LLM responde → [Answer] + [Source]s
//
//  DETALHE DE TYPESCRIPT:
//  `readonly` = a propriedade não pode ser trocada depois de criada
//  (imutabilidade). É o equivalente, em tempo de compilação, ao `frozen=True`
//  do Python. Objetos imutáveis geram menos bugs e são mais fáceis de raciocinar.
// ============================================================================

/** Um documento-fonte da base de conhecimento (ex.: um PDF ou um .md já lido). */
export interface Document {
  readonly id: string; // identificador único do documento
  readonly source: string; // de onde veio (nome/caminho) → usado pra citar a fonte
  readonly text: string; // o texto já EXTRAÍDO do arquivo
  readonly metadata?: Record<string, unknown>; // extras opcionais (autor, página...)
}

/** Um PEDAÇO menor de um Document. É o chunk que vira vetor e depois é buscado. */
export interface Chunk {
  readonly id: string; // id único do pedaço (ex.: "d1-0")
  readonly documentId: string; // a qual Document este chunk pertence
  readonly text: string; // o texto do pedaço
  readonly position: number; // ordem no documento (0,1,2...) → rastreabilidade
  readonly metadata?: Record<string, unknown>;
}

/** A pergunta que o usuário faz ao mentor. */
export interface Query {
  readonly text: string;
}

/** Um Chunk recuperado + o quão parecido ele é com a pergunta (0 a 1). */
export interface ScoredChunk {
  readonly chunk: Chunk;
  readonly score: number; // similaridade: perto de 1 = muito parecido; perto de 0 = nada
}

/** O conjunto de chunks recuperados para responder UMA pergunta (o "contexto"). */
export interface RetrievedContext {
  readonly chunks: ScoredChunk[]; // normalmente os "top-k" mais parecidos
}

/** Uma fonte citada na resposta — atende ao requisito de rastreabilidade. */
export interface Source {
  readonly documentId: string; // de qual documento
  readonly source: string; // nome do arquivo (ex.: clean_code.pdf)
  readonly position: number; // qual pedaço do documento
}

/** A resposta final do mentor + as FONTES de onde a informação foi recuperada. */
export interface Answer {
  readonly text: string; // o texto da resposta
  readonly sources: Source[]; // de onde ela saiu (rastreabilidade)
}

/**
 * Um "turno" da conversa: quem falou (aluno ou mentor) e o quê. A memória do
 * mentor é uma lista de turnos — é isso que permite o diálogo ter continuidade.
 */
export interface Turn {
  readonly role: 'aluno' | 'mentor';
  readonly text: string;
  readonly at: string; // data/hora em ISO (ex.: "2026-09-11T14:00:00.000Z")
}

/** Um registro do que o aluno estudou: a pergunta feita + as fontes tocadas. */
export interface StudyRecord {
  readonly question: string;
  readonly sources: string[]; // nomes dos documentos/fontes consultados
  readonly at: string; // ISO
}

/** Um resumo do perfil de aprendizado do aluno (o que ele vem estudando). */
export interface ProfileSummary {
  readonly total: number; // quantas perguntas fez
  readonly porFonte: { source: string; count: number }[]; // documentos mais consultados
  readonly ultimas: string[]; // últimas perguntas
}
