// ============================================================================
//  RANKING — orders chunks by similarity to the question (PURE logic)
// ============================================================================
//
//  WHY DOES THIS LIVE HERE (in the core)?
//  Because "score each vector with cosine, sort, and take the top-k" is PURE logic
//  — it doesn't depend on where the vectors are stored (memory, Mongo, etc.).
//  Extracting it to one place lets ALL vector stores (InMemory, Mongo...) reuse the
//  SAME rule. Less duplication, a single point to test (DRY).
// ============================================================================

import { cosineSimilarity } from './similarity.ts';
import type { Chunk, RetrievedContext, ScoredChunk } from './models.ts';

/** A chunk + the vector that represents it (what any store keeps). */
export interface RankableEntry {
  readonly chunk: Chunk;
  readonly embedding: number[];
}

/**
 * Scores each entry by cosine similarity to the question, sorts from most similar
 * to least, and returns the "top-k".
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

  scored.sort((a, b) => b.score - a.score); // from highest score to lowest
  return { chunks: scored.slice(0, k) }; // only the k best
}
