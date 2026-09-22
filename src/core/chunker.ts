// ============================================================================
//  CHUNKER — splits a Document into pieces (Chunks) for the RAG
// ============================================================================
//
//  WHY DO WE "SLICE" THE DOCUMENT?
//  In RAG, the search is done over PIECES, not the whole document. Reasons:
//    • a whole book is too big to fit in the LLM's context;
//    • smaller pieces make the search more PRECISE (less noise around).
//  Chunking is what decides "what the vector store keeps — and therefore what the
//  RAG can retrieve".
//
//  THE SIZE DECISION (trade-off — no silver bullet):
//    • SMALL chunk  → precise search, but loses the surrounding context.
//    • LARGE chunk  → keeps context, but brings noise and reduces precision.
//  Research suggests ~256–512 tokens for factual search, with ~10–20% overlap so an
//  idea isn't "cut" at the boundary.
//
//  ⚠️ Here we measure in WORDS (a simple token proxy: ~1 token ≈ ¾ of a word). We
//  start with a simple, correct strategy — a "sliding window" (the same overlap
//  concept). Later, at the evaluation phase, we MEASURE and tune the size with real
//  data instead of guessing.
//
//  ARCHITECTURE DECISION (critiquing my own earlier choice):
//  In Step 1 I created a `ChunkerPort`. But note: chunking is PURE LOGIC — it
//  doesn't depend on any external technology (LLM, database). So it doesn't need to
//  be an "adapter"; it lives here in `core`. We keep the INTERFACE (`ChunkerPort`)
//  not because of I/O, but to be able to SWAP the chunking strategy later (the
//  Strategy pattern) and compare which one retrieves better.
// ============================================================================

import type { Chunk, Document } from './models.ts';
import type { ChunkerPort } from './ports.ts';

/** Chunker configuration. Values in WORDS. */
export interface ChunkerConfig {
  readonly chunkSizeWords: number; // target size of each chunk
  readonly overlapWords: number; // words repeated between neighboring chunks
}

const DEFAULT_CONFIG: ChunkerConfig = {
  chunkSizeWords: 200, // ~250 tokens (good for factual search) — tuned with eval later
  overlapWords: 30, // ~15% overlap
};

/**
 * "Sliding window" strategy: slides a window of `chunkSizeWords` over the text,
 * advancing `chunkSizeWords - overlapWords` each step. The overlap words appear at
 * the end of one chunk and the start of the next (continuity).
 */
export class SlidingWindowChunker implements ChunkerPort {
  private readonly config: ChunkerConfig;

  constructor(config: Partial<ChunkerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Defensive programming: if the overlap is >= size, the window never "moves"
    // (infinite loop). Failing early, with a clear message, beats hanging later.
    if (this.config.overlapWords >= this.config.chunkSizeWords) {
      throw new Error(
        'overlapWords must be SMALLER than chunkSizeWords (otherwise the chunk never advances).',
      );
    }
  }

  chunk(document: Document): Chunk[] {
    // 1. Normalize: split the text into words (removing extra spaces/breaks).
    const words = document.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return []; // empty document → no chunks

    const { chunkSizeWords, overlapWords } = this.config;
    const step = chunkSizeWords - overlapWords; // how much the window moves per step

    const chunks: Chunk[] = [];
    let position = 0;

    for (let start = 0; start < words.length; start += step) {
      const slice = words.slice(start, start + chunkSizeWords);
      chunks.push({
        id: `${document.id}-${position}`, // e.g. "clean_code-0"
        documentId: document.id,
        text: slice.join(' '),
        position, // chunk order (0, 1, 2...)
        // We carry the ORIGIN (file name) along with the chunk. That way, later on,
        // the answer can CITE the exact source it retrieved from — the traceability
        // requirement ("don't make things up") turned into data.
        metadata: { source: document.source },
      });
      position += 1;

      // If this window already reached the end of the text, there's nothing left to slice.
      if (start + chunkSizeWords >= words.length) break;
    }

    return chunks;
  }
}
