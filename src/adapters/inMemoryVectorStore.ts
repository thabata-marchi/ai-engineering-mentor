// ============================================================================
//  InMemoryVectorStore — a SIMPLE vector store, kept in memory
// ============================================================================
//
//  WHAT DOES IT DO?
//  It stores the chunks together with their vectors (embeddings) and, given the
//  question (also embedded), returns the "top-k" most similar chunks — using cosine
//  similarity.
//
//  WHY START "BY HAND" (in memory)?
//  So you UNDERSTAND what a vector database (Chroma, Qdrant, pgvector...) does
//  inside: it's nothing more than "store vectors + find the nearest ones". Here,
//  with few documents (MVP), that fits in memory and is perfect for study and tests.
//  When the base grows, we swap for a real database — and, thanks to the
//  `VectorStorePort`, we change only THIS adapter.
//
//  ⚠️ LIMITATION (conscious): "in memory" = the data is gone when the program
//  closes, and the search is linear (compares against all). Great for tens/hundreds
//  of chunks; bad for millions. It's the right trade-off for the MVP.
// ============================================================================

import type { Chunk, RetrievedContext } from '../core/models.ts';
import type { VectorStorePort } from '../core/ports.ts';
import { rankByCosine } from '../core/ranking.ts';

/** A stored item: the chunk + the vector that represents it. */
export interface StoredEntry {
  readonly chunk: Chunk;
  readonly embedding: number[];
}

export class InMemoryVectorStore implements VectorStorePort {
  private readonly entries: StoredEntry[] = [];

  async add(chunks: Chunk[], embeddings: number[][]): Promise<void> {
    // Each chunk MUST have its matching vector (same count).
    if (chunks.length !== embeddings.length) {
      throw new Error(
        `Number of chunks (${chunks.length}) ≠ number of embeddings (${embeddings.length}).`,
      );
    }
    for (let i = 0; i < chunks.length; i++) {
      this.entries.push({ chunk: chunks[i], embedding: embeddings[i] });
    }
  }

  /**
   * "Photographs" the current content (chunks + vectors) to save to disk. This lets
   * us STORE the index and not recompute everything next time.
   */
  snapshot(): StoredEntry[] {
    return this.entries.map((e) => ({ chunk: e.chunk, embedding: e.embedding }));
  }

  /** Reloads a saved index (the inverse of snapshot). */
  restore(entries: StoredEntry[]): void {
    for (const entry of entries) this.entries.push(entry);
  }

  async search(queryEmbedding: number[], k: number): Promise<RetrievedContext> {
    // The score+sort+cut logic lives in the core (rankByCosine), so this store just
    // hands over its entries. MongoVectorStore does the same.
    return rankByCosine(this.entries, queryEmbedding, k);
  }
}
