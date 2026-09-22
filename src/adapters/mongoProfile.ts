// ============================================================================
//  MongoProfile — learning profile PERSISTED in MongoDB (Step 10)
// ============================================================================
//
//  Same contract as InMemoryProfile (the ProfilePort), but the study records go to
//  a Mongo collection (`study_log`). This way the mentor knows "what the student has
//  been studying" BETWEEN runs — and you can SEE it in Mongo Express.
//
//  We store ONE DOCUMENT PER STUDY: { studentId, question, sources, at }. The
//  SUMMARY reuses the same pure `summarize()` function from InMemoryProfile — the
//  business rule is single; only WHERE the data lives changes.
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
  readonly dbName?: string; // default: ai_mentor
  readonly collectionName?: string; // default: study_log
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
    // Fetch the records in chronological order and delegate aggregation to the pure function.
    const records = await col
      .find({ studentId }, { projection: { _id: 0, studentId: 0 } })
      .sort({ at: 1 })
      .toArray();
    return summarize(records);
  }

  /** Closes the connection — call it when shutting down the program. */
  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}
