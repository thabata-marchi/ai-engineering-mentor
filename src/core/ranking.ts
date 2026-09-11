// ============================================================================
//  RANKING — ordena chunks pela similaridade com a pergunta (lógica PURA)
// ============================================================================
//
//  POR QUE ISSO MORA AQUI (no core)?
//  Porque "pontuar cada vetor com cosseno, ordenar e pegar os top-k" é lógica
//  PURA — não depende de onde os vetores estão guardados (memória, Mongo, etc.).
//  Extraindo isso para um lugar só, TODOS os vector stores (InMemory, Mongo...)
//  reaproveitam a MESMA regra. Menos duplicação, um único ponto de teste (DRY).
// ============================================================================

import { cosineSimilarity } from './similarity.ts';
import type { Chunk, RetrievedContext, ScoredChunk } from './models.ts';

/** Um chunk + o vetor que o representa (o que qualquer store guarda). */
export interface RankableEntry {
  readonly chunk: Chunk;
  readonly embedding: number[];
}

/**
 * Pontua cada entry pela similaridade de cosseno com a pergunta, ordena do mais
 * parecido para o menos, e devolve os "top-k".
 */
export function rankByCosine(
  entries: readonly RankableEntry[],
  queryEmbedding: number[],
  k: number,
): RetrievedContext {
  const scored: ScoredChunk[] = entries.map((entry) => ({
    chunk: entry.chunk,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  scored.sort((a, b) => b.score - a.score); // do maior score para o menor
  return { chunks: scored.slice(0, k) }; // só os k melhores
}
