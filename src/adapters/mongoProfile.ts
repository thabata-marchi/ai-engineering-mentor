// ============================================================================
//  MongoProfile — perfil de aprendizado PERSISTIDO no MongoDB (Etapa 10)
// ============================================================================
//
//  Mesmo contrato do InMemoryProfile (o ProfilePort), mas os registros de estudo
//  vão para uma coleção do Mongo (`study_log`). Assim o mentor sabe "no que o
//  aluno vem estudando" ENTRE execuções — e você consegue VER isso no Mongo
//  Express.
//
//  Guardamos UM DOCUMENTO POR ESTUDO: { studentId, question, sources, at }. O
//  RESUMO reaproveita a mesma função pura `summarize()` do InMemoryProfile — a
//  regra de negócio é única; só muda ONDE os dados moram.
// ============================================================================

import { MongoClient, type Collection } from 'mongodb';

import type { ProfileSummary, StudyRecord } from '../core/models.ts';
import type { ProfilePort } from '../core/ports.ts';
import { summarize } from './inMemoryProfile.ts';

interface StudyDoc extends StudyRecord {
  readonly studentId: string;
}

export interface MongoProfileConfig {
  readonly url: string;
  readonly dbName?: string; // padrão: ai_mentor
  readonly collectionName?: string; // padrão: study_log
}

export class MongoProfile implements ProfilePort {
  private readonly client: MongoClient;
  private readonly dbName: string;
  private readonly collectionName: string;
  private connected = false;

  constructor(config: MongoProfileConfig) {
    this.client = new MongoClient(config.url);
    this.dbName = config.dbName ?? 'ai_mentor';
    this.collectionName = config.collectionName ?? 'study_log';
  }

  private async collection(): Promise<Collection<StudyDoc>> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
    return this.client.db(this.dbName).collection<StudyDoc>(this.collectionName);
  }

  async record(studentId: string, question: string, sources: string[]): Promise<void> {
    const col = await this.collection();
    await col.insertOne({ studentId, question, sources, at: new Date().toISOString() });
  }

  async summary(studentId: string): Promise<ProfileSummary> {
    const col = await this.collection();
    // Traz os registros em ordem cronológica e delega a agregação à função pura.
    const registros = await col
      .find({ studentId }, { projection: { _id: 0, studentId: 0 } })
      .sort({ at: 1 })
      .toArray();
    return summarize(registros);
  }

  /** Fecha a conexão — chamar ao encerrar o programa. */
  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}
