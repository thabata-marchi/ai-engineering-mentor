// ============================================================================
//  MongoVectorStore — vector store persistido no MongoDB (Etapa 7)
// ============================================================================
//
//  O QUE MUDA EM RELAÇÃO AO InMemoryVectorStore?
//  Só ONDE os vetores ficam guardados: aqui eles vão para um banco MongoDB, que
//  PERSISTE os dados (não somem quando o programa fecha). A busca continua sendo
//  a MESMA lógica de cosseno (rankByCosine, no core) — este adapter só cuida do
//  I/O com o banco. É o Princípio de Substituição de Liskov (o "L" do SOLID):
//  troca-se o adapter e o resto do sistema nem percebe.
//
//  ⚠️ IMPORTANTE (limitação consciente):
//  O MongoDB Community LOCAL não faz busca vetorial nativa ($vectorSearch é um
//  recurso do MongoDB Atlas, na nuvem). Então aqui a estratégia é: carregar os
//  vetores do banco e calcular o cosseno na APLICAÇÃO. Funciona perfeitamente
//  para estudo e para bases de dezenas/centenas de milhares de chunks. Para
//  escala grande de verdade, o passo seguinte seria o Atlas Vector Search —
//  e, de novo, mudaria só ESTE adapter.
//
//  PRÉ-REQUISITO: um MongoDB rodando (ex.: via Docker) e a variável MONGO_URL.
// ============================================================================

import { MongoClient, type Collection } from 'mongodb';

import type { Chunk, RetrievedContext } from '../core/models.ts';
import type { VectorStorePort } from '../core/ports.ts';
import { rankByCosine, type RankableEntry } from '../core/ranking.ts';

/** Formato do documento guardado no Mongo (chunk + vetor). */
interface VectorDoc extends RankableEntry {
  readonly chunk: Chunk;
  readonly embedding: number[];
}

export interface MongoVectorStoreConfig {
  readonly url: string; // ex.: mongodb://localhost:27017
  readonly dbName?: string; // padrão: ai_mentor
  readonly collectionName?: string; // padrão: chunks
}

export class MongoVectorStore implements VectorStorePort {
  private readonly client: MongoClient;
  private readonly dbName: string;
  private readonly collectionName: string;
  private connected = false;

  constructor(config: MongoVectorStoreConfig) {
    this.client = new MongoClient(config.url);
    this.dbName = config.dbName ?? 'ai_mentor';
    this.collectionName = config.collectionName ?? 'chunks';
  }

  /** Conecta uma vez só (lazy). */
  private async collection(): Promise<Collection<VectorDoc>> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
    return this.client.db(this.dbName).collection<VectorDoc>(this.collectionName);
  }

  async add(chunks: Chunk[], embeddings: number[][]): Promise<void> {
    if (chunks.length !== embeddings.length) {
      throw new Error(
        `Nº de chunks (${chunks.length}) ≠ nº de embeddings (${embeddings.length}).`,
      );
    }
    if (chunks.length === 0) return;

    const col = await this.collection();
    const docs: VectorDoc[] = chunks.map((chunk, i) => ({ chunk, embedding: embeddings[i] }));
    await col.insertMany(docs);
  }

  async search(queryEmbedding: number[], k: number): Promise<RetrievedContext> {
    const col = await this.collection();
    // Carrega os vetores do banco e ranqueia na aplicação (mesma lógica do core).
    // projection: traz só o necessário (sem o _id) para economizar.
    const docs = await col.find({}, { projection: { _id: 0 } }).toArray();
    return rankByCosine(docs, queryEmbedding, k);
  }

  /** Quantos vetores já estão indexados (útil pra decidir se precisa reindexar). */
  async count(): Promise<number> {
    const col = await this.collection();
    return col.countDocuments();
  }

  /**
   * Lê a "assinatura" da base indexada (guardada numa coleção _meta). Serve para
   * o CLI saber se o conteúdo atual bate com o que já está no Mongo — se bater,
   * não precisa reindexar. É o mesmo papel do cache em disco do modo em memória.
   */
  async readSignature(): Promise<string | null> {
    const meta = this.client.db(this.dbName).collection<{ _id: string; value: string }>('_meta');
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
    const doc = await meta.findOne({ _id: 'signature' });
    return doc?.value ?? null;
  }

  /** Grava a assinatura da base recém-indexada. */
  async writeSignature(value: string): Promise<void> {
    await this.collection(); // garante conexão
    const meta = this.client.db(this.dbName).collection<{ _id: string; value: string }>('_meta');
    // O _id vem do filtro no upsert; o documento de substituição não o repete.
    await meta.replaceOne({ _id: 'signature' }, { value }, { upsert: true });
  }

  /** Apaga tudo (usado quando a base muda e precisamos reindexar). */
  async clear(): Promise<void> {
    const col = await this.collection();
    await col.deleteMany({});
  }

  /** Fecha a conexão — importante chamar ao encerrar o programa. */
  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}
