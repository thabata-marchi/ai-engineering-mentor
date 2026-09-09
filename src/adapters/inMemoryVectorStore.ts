// ============================================================================
//  InMemoryVectorStore — um banco de vetores SIMPLES, guardado na memória
// ============================================================================
//
//  O QUE ELE FAZ?
//  Guarda os chunks junto com seus vetores (embeddings) e, dada a pergunta
//  (também vetorizada), devolve os "top-k" chunks mais parecidos — usando a
//  similaridade de cosseno.
//
//  POR QUE COMEÇAR "NA MÃO" (em memória)?
//  Para você ENTENDER o que um banco de vetores (Chroma, Qdrant, pgvector...)
//  faz por dentro: ele nada mais é do que "guardar vetores + achar os mais
//  próximos". Aqui, com poucos documentos (MVP), isso cabe na memória e é
//  perfeito para estudo e testes. Quando a base crescer, trocamos por um banco
//  de verdade — e, graças ao `VectorStorePort`, mudamos só ESTE adapter.
//
//  ⚠️ LIMITAÇÃO (consciente): "na memória" = os dados somem quando o programa
//  fecha, e a busca é linear (compara com todos). Ótimo para dezenas/centenas de
//  chunks; ruim para milhões. É o trade-off certo para o MVP.
// ============================================================================

import { cosineSimilarity } from '../core/similarity.ts';
import type { Chunk, RetrievedContext, ScoredChunk } from '../core/models.ts';
import type { VectorStorePort } from '../core/ports.ts';

/** Um item guardado: o chunk + o vetor que o representa. */
export interface StoredEntry {
  readonly chunk: Chunk;
  readonly embedding: number[];
}

export class InMemoryVectorStore implements VectorStorePort {
  private readonly entries: StoredEntry[] = [];

  async add(chunks: Chunk[], embeddings: number[][]): Promise<void> {
    // Cada chunk PRECISA ter o seu vetor correspondente (mesma quantidade).
    if (chunks.length !== embeddings.length) {
      throw new Error(
        `Nº de chunks (${chunks.length}) ≠ nº de embeddings (${embeddings.length}).`,
      );
    }
    for (let i = 0; i < chunks.length; i++) {
      this.entries.push({ chunk: chunks[i], embedding: embeddings[i] });
    }
  }

  /**
   * "Fotografa" o conteúdo atual (chunks + vetores) para salvar em disco.
   * Assim conseguimos GUARDAR o índice e não recalcular tudo na próxima vez.
   */
  snapshot(): StoredEntry[] {
    return this.entries.map((e) => ({ chunk: e.chunk, embedding: e.embedding }));
  }

  /** Recarrega um índice salvo (o inverso do snapshot). */
  restore(entries: StoredEntry[]): void {
    for (const entry of entries) this.entries.push(entry);
  }

  async search(queryEmbedding: number[], k: number): Promise<RetrievedContext> {
    // 1. Pontua CADA chunk pela similaridade com a pergunta.
    const scored: ScoredChunk[] = this.entries.map((entry) => ({
      chunk: entry.chunk,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    // 2. Ordena do mais parecido para o menos parecido.
    scored.sort((a, b) => b.score - a.score);

    // 3. Devolve só os "top-k" (os k melhores).
    return { chunks: scored.slice(0, k) };
  }
}
