// ============================================================================
//  LLMJudge — "LLM-as-judge" (Etapa 13, opcional): um modelo avalia o outro
// ============================================================================
//
//  A IDEIA: pedir a um LLM que dê uma NOTA de fidelidade (faithfulness) para uma
//  resposta, dado o contexto que a originou. É útil para medir algo que métrica
//  determinística não pega: "a resposta INVENTOU ou se apoiou nas fontes?".
//
//  ⚠️ CUSTA COTA e é NÃO-DETERMINÍSTICO (o modelo pode variar). Por isso é
//  OPCIONAL — o harness roda sem ele por padrão. Nos testes usamos um juiz falso.
//
//  Reaproveitamos o LLMPort que já temos (só `generate`). Pedimos ao juiz para
//  responder APENAS um número de 0 a 1; fazemos um parse robusto (extrai o 1º
//  número), com fallback seguro se a saída vier fora do esperado.
// ============================================================================

import type { JudgePort, LLMPort } from '../core/ports.ts';

const JUDGE_SYSTEM = [
  'Você é um avaliador rigoroso. Receberá uma PERGUNTA, um CONTEXTO e uma RESPOSTA.',
  'Avalie a FIDELIDADE da resposta ao contexto: o quanto ela se apoia SOMENTE no',
  'contexto, sem inventar. Responda APENAS com um número de 0 a 1 (ex.: 0.8).',
  '0 = a resposta inventa ou contradiz o contexto; 1 = totalmente ancorada no contexto.',
].join('\n');

export class LLMJudge implements JudgePort {
  private readonly llm: LLMPort;

  constructor(llm: LLMPort) {
    this.llm = llm;
  }

  async faithfulness(question: string, answer: string, context: string): Promise<number> {
    const user = `PERGUNTA:\n${question}\n\nCONTEXTO:\n${context}\n\nRESPOSTA:\n${answer}\n\nNota (0 a 1):`;
    const saida = await this.llm.generate(JUDGE_SYSTEM, user);
    return parseNota(saida);
  }
}

/** Extrai a 1ª ocorrência de um número e o limita a [0, 1]. Fallback: 0. */
export function parseNota(texto: string): number {
  const m = texto.match(/\d+(\.\d+)?/);
  if (!m) return 0;
  const n = Number(m[0]);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
