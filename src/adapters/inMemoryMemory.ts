// ============================================================================
//  InMemoryMemory — conversation memory kept only in RAM (does not persist)
// ============================================================================
//
//  It's the simplest MemoryPort adapter: it stores the turns in an in-memory
//  object. It serves as the DEFAULT (when there is no Mongo) and for the TESTS
//  (fast, no external dependency). When the program closes, the history is gone —
//  so, to remember between runs, we use MongoMemory.
// ============================================================================

import type { Turn } from '../core/models.ts';
import type { MemoryPort } from '../core/ports.ts';

export class InMemoryMemory implements MemoryPort {
  // sessionId → list of turns of that conversation.
  private readonly sessions = new Map<string, Turn[]>();

  async append(sessionId: string, turn: Turn): Promise<void> {
    const turns = this.sessions.get(sessionId) ?? [];
    turns.push(turn);
    this.sessions.set(sessionId, turns);
  }

  async history(sessionId: string, limit?: number): Promise<Turn[]> {
    const turns = this.sessions.get(sessionId) ?? [];
    // Returns the LAST `limit` turns, keeping chronological order.
    return limit ? turns.slice(-limit) : [...turns];
  }
}
