// ============================================================================
//  InMemoryProfile — learning profile kept only in RAM (does not persist)
// ============================================================================
//
//  The simplest ProfilePort adapter: it accumulates the study records (question +
//  sources touched) in an in-memory array. It serves as the DEFAULT (when there is
//  no Mongo) and for the TESTS. When the program closes, the history is gone — to
//  remember between runs, we use MongoProfile.
//
//  The SUMMARY logic (count by source, take the latest questions) lives here, but
//  note it's identical in MongoProfile: both answer the same contract (ProfilePort).
//  The caller doesn't know — nor needs to know — which of the two is underneath.
//  That's Dependency Inversion in practice.
// ============================================================================

import { analyzeDifficulty } from '../core/difficulty.ts';
import type { ProfileSummary, StudyRecord } from '../core/models.ts';
import type { ProfilePort } from '../core/ports.ts';

const RECENT_LIMIT = 5; // how many recent questions the summary shows

export class InMemoryProfile implements ProfilePort {
  // studentId → list of study records (in arrival order).
  private readonly students = new Map<string, StudyRecord[]>();

  async record(studentId: string, question: string, sources: string[]): Promise<void> {
    const records = this.students.get(studentId) ?? [];
    records.push({ question, sources, at: new Date().toISOString() });
    this.students.set(studentId, records);
  }

  async summary(studentId: string): Promise<ProfileSummary> {
    const records = this.students.get(studentId) ?? [];
    return summarize(records);
  }
}

/**
 * Aggregates a list of records into a ProfileSummary. It's a PURE function (same
 * input → same output, no side effects), so it's trivial to test and is reused by
 * MongoProfile.
 */
export function summarize(records: readonly StudyRecord[]): ProfileSummary {
  // Count how many times each source was touched.
  const counts = new Map<string, number>();
  for (const r of records) {
    for (const s of r.sources) {
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
  }

  const bySource = [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count); // most consulted first

  const recent = records
    .slice(-RECENT_LIMIT) // the N most recent
    .reverse() // from newest to oldest
    .map((r) => r.question);

  // Step 19: infer areas that MAY need review from the same records (pure heuristic).
  const { areas: difficulties } = analyzeDifficulty(records);

  return { total: records.length, bySource, recent, difficulties };
}
