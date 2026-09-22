// ============================================================================
//  InMemoryProfile — perfil de aprendizado guardado só na RAM (não persiste)
// ============================================================================
//
//  Adapter mais simples do ProfilePort: acumula os registros de estudo (pergunta
//  + fontes tocadas) num array em memória. Serve como PADRÃO (quando não há
//  Mongo) e para os TESTES. Quando o programa fecha, o histórico some — para
//  lembrar entre execuções, usamos o MongoProfile.
//
//  A lógica de RESUMO (contar por fonte, pegar as últimas perguntas) mora aqui,
//  mas repare que ela é idêntica no MongoProfile: ambos respondem ao mesmo
//  contrato (ProfilePort). Quem chama não sabe — nem precisa saber — qual dos
//  dois está por baixo. Isso é a Inversão de Dependência na prática.
// ============================================================================

import type { ProfileSummary, StudyRecord } from '../core/models.ts';
import type { ProfilePort } from '../core/ports.ts';

const ULTIMAS_LIMIT = 5; // quantas perguntas recentes o resumo mostra

export class InMemoryProfile implements ProfilePort {
  // studentId → lista de registros de estudo (em ordem de chegada).
  private readonly students = new Map<string, StudyRecord[]>();

  async record(studentId: string, question: string, sources: string[]): Promise<void> {
    const registros = this.students.get(studentId) ?? [];
    registros.push({ question, sources, at: new Date().toISOString() });
    this.students.set(studentId, registros);
  }

  async summary(studentId: string): Promise<ProfileSummary> {
    const registros = this.students.get(studentId) ?? [];
    return summarize(registros);
  }
}

/**
 * Agrega uma lista de registros num ProfileSummary. É uma função PURA (mesma
 * entrada → mesma saída, sem efeitos), então é trivial de testar e é
 * reaproveitada pelo MongoProfile.
 */
export function summarize(registros: readonly StudyRecord[]): ProfileSummary {
  // Conta quantas vezes cada fonte foi tocada.
  const contagem = new Map<string, number>();
  for (const r of registros) {
    for (const s of r.sources) {
      contagem.set(s, (contagem.get(s) ?? 0) + 1);
    }
  }

  const bySource = [...contagem.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count); // mais consultadas primeiro

  const recent = registros
    .slice(-ULTIMAS_LIMIT) // as N mais recentes
    .reverse() // da mais nova para a mais antiga
    .map((r) => r.question);

  return { total: registros.length, bySource, recent };
}
