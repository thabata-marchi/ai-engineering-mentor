// ============================================================================
//  MongoVectorStore — vector store persisted in MongoDB (Step 7)
// ============================================================================
//
//  WHAT CHANGES VERSUS InMemoryVectorStore?
//  Only WHERE the vectors are stored: here they go to a MongoDB database, which
//  PERSISTS the data (it doesn't vanish when the program closes). The search is
//  still the SAME cosine logic (rankByCosine, in the core) — this adapter only
//  handles the I/O with the database. It's Liskov Substitution (the "L" of SOLID):
//  swap the adapter and the rest of the system doesn't even notice.
//
//  ⚠️ IMPORTANT (conscious limitation):
//  LOCAL MongoDB Community does not do native vector search ($vectorSearch is a
//  MongoDB Atlas feature, in the cloud). So here the strategy is: load the vectors
//  from the database and compute the cosine in the APPLICATION. It works perfectly
//  for study and for bases of tens/hundreds of thousands of chunks. For true large
//  scale, the next step would be Atlas Vector Search — and, again, it would change
//  only THIS adapter.
//
//  PREREQUISITE: a running MongoDB (e.g. via Docker) and the MONGO_URL variable.
// ============================================================================

import { MongoClient, type Collection } from 'mongodb';

import type { Chunk, RetrievedContext } from '../core/models.ts';
import type { VectorStorePort } from '../core/ports.ts';
import { rankByCosine, type RankableEntry } from '../core/ranking.ts';

/** Shape of the document stored in Mongo (chunk + vector). */
interface VectorDoc extends RankableEntry {
  readonly chunk: Chunk;
  readonly embedding: number[];
}

export interface MongoVectorStoreConfig {
  readonly url: string; // e.g. mongodb://localhost:27017
  readonly dbName?: string; // default: ai_mentor
  readonly collectionName?: string; // default: chunks
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

  /** Connects only once (lazy). */
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
        `Number of chunks (${chunks.length}) ≠ number of embeddings (${embeddings.length}).`,
      );
    }
    if (chunks.length === 0) return;

    const col = await this.collection();
    const docs: VectorDoc[] = chunks.map((chunk, i) => ({ chunk, embedding: embeddings[i] }));
    await col.insertMany(docs);
  }

  async search(queryEmbedding: number[], k: number): Promise<RetrievedContext> {
    const col = await this.collection();
    // Load the vectors from the database and rank in the application (same core logic).
    // projection: bring only what's needed (no _id) to save bandwidth.
    const docs = await col.find({}, { projection: { _id: 0 } }).toArray();
    return rankByCosine(docs, queryEmbedding, k);
  }

  /** How many vectors are already indexed (useful to decide whether to re-index). */
  async count(): Promise<number> {
    const col = await this.collection();
    return col.countDocuments();
  }

  /**
   * Reads the "signature" of the indexed base (stored in a _meta collection). It
   * lets the CLI know whether the current content matches what's already in Mongo —
   * if it matches, no re-indexing is needed. It's the same role as the on-disk cache
   * of the in-memory mode.
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

  /** Writes the signature of the freshly-indexed base. */
  async writeSignature(value: string): Promise<void> {
    await this.collection(); // ensures the connection
    const meta = this.client.db(this.dbName).collection<{ _id: string; value: string }>('_meta');
    // The _id comes from the upsert filter; the replacement document doesn't repeat it.
    await meta.replaceOne({ _id: 'signature' }, { value }, { upsert: true });
  }

  /** Deletes everything (used when the base changes and we need to re-index). */
  async clear(): Promise<void> {
    const col = await this.collection();
    await col.deleteMany({});
  }

  /** Closes the connection — important to call when shutting down the program. */
  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}
