// ============================================================================
//  CHUNKER — quebra um Document em pedaços (Chunks) para o RAG
// ============================================================================
//
//  POR QUE PRECISAMOS "PICAR" O DOCUMENTO?
//  No RAG, a busca é feita por PEDAÇOS, não pelo documento inteiro. Motivos:
//    • um livro inteiro é grande demais para caber no contexto do LLM;
//    • pedaços menores deixam a busca mais PRECISA (menos ruído em volta).
//  Como o professor mostrou no curso, é o chunking que decide "o que o banco de
//  vetores guarda — e, portanto, o que o RAG consegue recuperar".
//
//  A DECISÃO DE TAMANHO (trade-off — sem bala de prata):
//    • chunk PEQUENO  → busca precisa, mas perde o contexto em volta.
//    • chunk GRANDE   → mantém contexto, mas traz ruído e reduz a precisão.
//  A pesquisa sugere ~256–512 tokens para busca factual, com ~10–20% de
//  sobreposição (overlap) para não "cortar" uma informação na fronteira.
//  (fontes citadas no chat / ANALISE-ARQUITETURA.md)
//
//  ⚠️ Aqui medimos em PALAVRAS (proxy simples de tokens: ~1 token ≈ ¾ de palavra).
//  Começamos com uma estratégia simples e correta — "janela deslizante" (o mesmo
//  conceito de overlap que você viu no resumo de conversas do Módulo 4!). Depois,
//  na Fase 7 (Evaluation), a gente MEDE e ajusta o tamanho com dados reais, em vez
//  de chutar.
//
//  DECISÃO DE ARQUITETURA (crítica à minha própria escolha anterior):
//  Na Etapa 1 eu criei um `ChunkerPort`. Mas repare: chunking é LÓGICA PURA — não
//  depende de nenhuma tecnologia externa (LLM, banco). Então ele não precisa ser
//  um "adapter"; ele mora aqui no `core`. Mantemos a INTERFACE (`ChunkerPort`)
//  não por causa de I/O, e sim para poder TROCAR a estratégia de chunking depois
//  (isso é o padrão de projeto "Strategy") e comparar qual recupera melhor.
// ============================================================================

import type { Chunk, Document } from './models.ts';
import type { ChunkerPort } from './ports.ts';

/** Configuração do chunker. Valores em PALAVRAS. */
export interface ChunkerConfig {
  readonly chunkSizeWords: number; // tamanho alvo de cada chunk
  readonly overlapWords: number; // palavras repetidas entre chunks vizinhos
}

const DEFAULT_CONFIG: ChunkerConfig = {
  chunkSizeWords: 200, // ~250 tokens (bom p/ busca factual) — ajustamos com eval depois
  overlapWords: 30, // ~15% de sobreposição
};

/**
 * Estratégia "janela deslizante": desliza uma janela de `chunkSizeWords` sobre o
 * texto, avançando `chunkSizeWords - overlapWords` a cada passo. As palavras do
 * overlap aparecem no fim de um chunk e no começo do próximo (continuidade).
 */
export class SlidingWindowChunker implements ChunkerPort {
  private readonly config: ChunkerConfig;

  constructor(config: Partial<ChunkerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Programação defensiva: se o overlap for >= tamanho, a janela nunca "anda"
    // (loop infinito). Falhar cedo, com mensagem clara, é melhor que travar depois.
    if (this.config.overlapWords >= this.config.chunkSizeWords) {
      throw new Error(
        'overlapWords precisa ser MENOR que chunkSizeWords (senão o chunk não avança).',
      );
    }
  }

  chunk(document: Document): Chunk[] {
    // 1. Normaliza: separa o texto em palavras (removendo espaços/quebras extras).
    const words = document.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return []; // documento vazio → nenhum chunk

    const { chunkSizeWords, overlapWords } = this.config;
    const step = chunkSizeWords - overlapWords; // quanto a janela anda por passo

    const chunks: Chunk[] = [];
    let position = 0;

    for (let start = 0; start < words.length; start += step) {
      const slice = words.slice(start, start + chunkSizeWords);
      chunks.push({
        id: `${document.id}-${position}`, // ex.: "clean_code-0"
        documentId: document.id,
        text: slice.join(' '),
        position, // ordem do chunk (0, 1, 2...)
        // Carregamos a ORIGEM (nome do arquivo) junto do chunk. Assim, lá na
        // frente, a resposta consegue CITAR a fonte exata de onde recuperou —
        // é o requisito de rastreabilidade ("não invento") virando dado.
        metadata: { source: document.source },
      });
      position += 1;

      // Se esta janela já alcançou o fim do texto, não há mais o que fatiar.
      if (start + chunkSizeWords >= words.length) break;
    }

    return chunks;
  }
}
