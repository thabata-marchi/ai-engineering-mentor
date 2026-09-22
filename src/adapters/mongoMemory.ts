// ============================================================================
//  MongoMemory — conversation memory PERSISTED in MongoDB (Step 8)
// ============================================================================
//
//  Same contract as InMemoryMemory (the MemoryPort), but the turns go to a Mongo
//  collection (`conversations`). This way the mentor REMEMBERS the conversation
//  between runs — and you can SEE the history in Mongo Express.
//
//  We store ONE DOCUMENT PER TURN: { sessionId, role, text, at }. The order is
//  guaranteed by the `at` field (date/time). Simple and traceable.
// ============================================================================

import { MongoClient, type Collection } from 'mongodb';

import type { Turn } from '../core/models.ts';
import type { MemoryPort } from '../core/ports.ts';

interface TurnDoc extends Turn {
  readonly sessionId: string;
}

export interface MongoMemoryConfig {
  readonly url: string;
  readonly dbName?: string; // default: ai_mentor
  readonly collectionName?: string; // default: conversations
}

export class MongoMemory implements MemoryPort {
  private readonly client: MongoClient;
  private readonly dbName: string;
  private readonly collectionName: string;
  private connected = false;

  constructor(config: MongoMemoryConfig) {
    this.client = new MongoClient(config.url);
    this.dbName = config.dbName ?? 'ai_mentor';
    this.collectionName = config.collectionName ?? 'conversations';
  }

  private async collection(): Promise<Collection<TurnDoc>> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
    return this.client.db(this.dbName).collection<TurnDoc>(this.collectionName);
  }

  async append(sessionId: string, turn: Turn): Promise<void> {
    const col = await this.collection();
    await col.insertOne({ sessionId, ...turn });
  }

  async history(sessionId: string, limit?: number): Promise<Turn[]> {
    const col = await this.collection();
    // Sort by ascending date; if there is a limit, take the last N (most recent)
    // and then return them in chronological order.
    const cursor = col.find({ sessionId }, { projection: { _id: 0, sessionId: 0 } });
    if (limit) {
      const recent = await cursor.sort({ at: -1 }).limit(limit).toArray();
      return recent.reverse();
    }
    return cursor.sort({ at: 1 }).toArray();
  }

  /** Closes the connection — call it when shutting down the program. */
  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}
