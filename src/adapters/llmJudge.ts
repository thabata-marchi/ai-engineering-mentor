// ============================================================================
//  LLMJudge — "LLM-as-judge" (Step 13, optional): one model evaluates another
// ============================================================================
//
//  THE IDEA: ask an LLM to give a faithfulness SCORE to an answer, given the context
//  that produced it. It's useful to measure something a deterministic metric can't
//  catch: "did the answer MAKE THINGS UP or rely on the sources?".
//
//  ⚠️ It COSTS QUOTA and is NON-DETERMINISTIC (the model may vary). That's why it's
//  OPTIONAL — the harness runs without it by default. In tests we use a fake judge.
//
//  We reuse the LLMPort we already have (just `generate`). We ask the judge to reply
//  ONLY with a number from 0 to 1; we do a robust parse (extract the first number),
//  with a safe fallback if the output comes out unexpected.
// ============================================================================

import type { JudgePort, LLMPort } from '../core/ports.ts';

const JUDGE_SYSTEM = [
  'You are a strict evaluator. You will receive a QUESTION, a CONTEXT and an ANSWER.',
  'Assess the FAITHFULNESS of the answer to the context: how much it relies ONLY on',
  'the context, without making things up. Reply ONLY with a number from 0 to 1 (e.g. 0.8).',
  '0 = the answer makes things up or contradicts the context; 1 = fully grounded in the context.',
].join('\n');

export class LLMJudge implements JudgePort {
  private readonly llm: LLMPort;

  constructor(llm: LLMPort) {
    this.llm = llm;
  }

  async faithfulness(question: string, answer: string, context: string): Promise<number> {
    const user = `QUESTION:\n${question}\n\nCONTEXT:\n${context}\n\nANSWER:\n${answer}\n\nScore (0 to 1):`;
    const output = await this.llm.generate(JUDGE_SYSTEM, user);
    return parseScore(output);
  }
}

/** Extracts the first occurrence of a number and clamps it to [0, 1]. Fallback: 0. */
export function parseScore(text: string): number {
  const m = text.match(/\d+(\.\d+)?/);
  if (!m) return 0;
  const n = Number(m[0]);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
