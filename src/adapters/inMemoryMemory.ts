// ============================================================================
//  InMemoryMemory — memória da conversa guardada só na RAM (não persiste)
// ============================================================================
//
//  É o adapter mais simples do MemoryPort: guarda os turnos num objeto em
//  memória. Serve como PADRÃO (quando não há Mongo) e para os TESTES (rápido,
//  sem dependência externa). Quando o programa fecha, o histórico some — por
//  isso, para lembrar entre execuções, usamos o MongoMemory.
// ============================================================================

import type { Turn } from '../core/models.ts';
import type { MemoryPort } from '../core/ports.ts';

export class InMemoryMemory implements MemoryPort {
  // sessionId → lista de turnos daquela conversa.
  private readonly sessions = new Map<string, Turn[]>();

  async append(sessionId: string, turn: Turn): Promise<void> {
    const turns = this.sessions.get(sessionId) ?? [];
    turns.push(turn);
    this.sessions.set(sessionId, turns);
  }

  async history(sessionId: string, limit?: number): Promise<Turn[]> {
    const turns = this.sessions.get(sessionId) ?? [];
    // Devolve os ÚLTIMOS `limit` turnos, mantendo a ordem cronológica.
    return limit ? turns.slice(-limit) : [...turns];
  }
}
