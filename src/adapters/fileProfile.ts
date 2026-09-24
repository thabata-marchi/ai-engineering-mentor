// ============================================================================
//  FileProfile — learning profile PERSISTED in a JSON file (Step 20)
// ============================================================================
//
//  WHY THIS EXISTS:
//  InMemoryProfile forgets everything when the process exits; MongoProfile
//  remembers, but requires Docker/Mongo. This adapter is the middle ground: it
//  persists the study log to a plain JSON file on disk — so the mentor remembers
//  "where the student got stuck before" ACROSS SESSIONS, with zero infrastructure.
//  Same idea the project already uses for the vector index cache (indexCache.ts).
//
//  SAME CONTRACT (ProfilePort):
//  record() appends a study and saves; summary() reads and delegates the
//  aggregation to the SAME pure `summarize()` used by the other adapters — so the
//  business rule (counts, recent, difficulty detection) is single and shared.
//
//  FILE SHAPE:  { "<studentId>": [ { question, sources, at }, ... ], ... }
//
//  ⚠️ Scope: this is a local, single-user study tool. Writes rewrite the whole
//  file (simple and safe enough here); it is not meant for concurrent writers.
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { ProfileSummary, StudyRecord } from '../core/models.ts';
import type { ProfilePort } from '../core/ports.ts';
import { summarize } from './inMemoryProfile.ts';

/** studentId → their study records (in arrival order). */
type ProfileStore = Record<string, StudyRecord[]>;

export class FileProfile implements ProfilePort {
  private readonly path: string;
  private cache: ProfileStore | null = null; // loaded lazily, kept in sync with the file

  constructor(path: string) {
    this.path = path;
  }

  /** Loads the file once (empty if missing or unreadable — never throws). */
  private async load(): Promise<ProfileStore> {
    if (this.cache) return this.cache;
    let store: ProfileStore;
    try {
      const raw = await readFile(this.path, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      // Guard against a corrupted/foreign file: only accept a plain object.
      store =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as ProfileStore)
          : {};
    } catch {
      store = {}; // first run or unreadable → start fresh
    }
    this.cache = store;
    return store;
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  async record(studentId: string, question: string, sources: string[]): Promise<void> {
    const store = await this.load();
    const records = store[studentId] ?? [];
    records.push({ question, sources, at: new Date().toISOString() });
    store[studentId] = records;
    await this.persist();
  }

  async summary(studentId: string): Promise<ProfileSummary> {
    const store = await this.load();
    return summarize(store[studentId] ?? []);
  }
}
