// ============================================================================
//  MongoMemory — memória da conversa PERSISTIDA no MongoDB (Etapa 8)
// ============================================================================
//
//  Mesmo contrato do InMemoryMemory (o MemoryPort), mas os turnos vão para uma
//  coleção do Mongo (`conversations`). Assim o mentor LEMBRA da conversa entre
//  execuções — e você consegue VER o histórico no Mongo Express.
//
//  Guardamos UM DOCUMENTO POR TURNO: { sessionId, role, text, at }. A ordem é
//  garantida pelo campo `at` (data/hora). Simples e rastreável.
// ============================================================================

import { MongoClient, type Collection } from 'mongodb';

import type { Turn } from '../core/models.ts';
import type { MemoryPort } from '../core/ports.ts';

interface TurnDoc extends Turn {
  readonly sessionId: string;
}

export interface MongoMemoryConfig {
  readonly url: string;
  readonly dbName?: string; // padrão: ai_mentor
  readonly collectionName?: string; // padrão: conversations
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
    // Ordena por data crescente; se houver limite, pega os últimos N (mais recentes)
    // e depois devolve em ordem cronológica.
    const cursor = col.find({ sessionId }, { projection: { _id: 0, sessionId: 0 } });
    if (limit) {
      const recentes = await cursor.sort({ at: -1 }).limit(limit).toArray();
      return recentes.reverse();
    }
    return cursor.sort({ at: 1 }).toArray();
  }

  /** Fecha a conexão — chamar ao encerrar o programa. */
  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}
