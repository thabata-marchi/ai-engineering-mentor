// ============================================================================
//  indexCache — keeps the vector index on disk (to avoid re-indexing every time)
// ============================================================================
//
//  THE PROBLEM THIS SOLVES:
//  Generating embeddings is EXPENSIVE (it's the slow part). Re-indexing the same
//  PDF on every run is a waste. Solution: after indexing once, we SAVE the result
//  to a file. Next time, if nothing changed, we just LOAD it — the search is instant.
//
//  HOW TO KNOW IF "NOTHING CHANGED"? A SIGNATURE.
//  We store alongside it a "fingerprint" of the input: file names+sizes+dates + the
//  chunking config + the model + the precision (dtype). If the saved signature ==
//  the current signature, the cache is valid. If something changed (you swapped the
//  PDF or the chunk size), the signature changes and we re-index.
//  This is "cache invalidation" — one of the classic problems in computing. :)
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { StoredEntry } from './inMemoryVectorStore.ts';

export interface CachedIndex {
  readonly signature: string; // the input's "fingerprint"
  readonly entries: StoredEntry[]; // chunks + already-computed vectors
}

/** Reads the saved index. Returns null if it doesn't exist or is unreadable. */
export async function loadIndex(path: string): Promise<CachedIndex | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as CachedIndex;
  } catch {
    return null; // no cache (first time) or corrupted file → re-index
  }
}

/** Saves the index (creates the folder if needed). */
export async function saveIndex(path: string, data: CachedIndex): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data), 'utf-8');
}
