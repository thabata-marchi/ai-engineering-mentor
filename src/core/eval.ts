// ============================================================================
//  eval — quality EVALUATION (Step 13): the "golden dataset" + metrics
// ============================================================================
//
//  WHY EVALUATE?
//  "The mentor answers" is not the same as "the mentor answers WELL". Here we
//  measure quality in an OBJECTIVE, repeatable way, comparing the answers against a
//  set of cases with expectations (the "golden dataset").
//
//  DETERMINISTIC METRICS (run for free, no LLM, and in the tests):
//    • source-hit  → did any EXPECTED source show up in what was retrieved?
//                    (measures RETRIEVAL quality — the heart of RAG)
//    • citation    → did the answer CITE a source in the [n] format? (traceability)
//    • mention     → does the answer MENTION the expected key terms?
//  Each metric can be "not applicable" (null) when the case doesn't define that
//  expectation — and then it doesn't count toward the average.
//
//  These functions are PURE (take case + answer, return the scorecard), so they are
//  trivial to test and don't depend on the network.
// ============================================================================

import type { Answer } from './models.ts';

/** A golden-dataset case: the question + what we expect from it. */
export interface GoldenCase {
  readonly question: string;
  readonly expectedSources?: string[]; // at least one must show up in retrieval
  readonly mustMention?: string[]; // terms the answer must contain (case-insensitive)
  readonly mustNotContain?: string[]; // terms the answer must NOT contain (Step 14 — adversarial)
}

/** The scorecard of ONE case. `null` = the metric doesn't apply to this case. */
export interface CaseResult {
  readonly question: string;
  readonly sourceHit: boolean | null;
  readonly cited: boolean;
  readonly mentioned: boolean | null;
  readonly resisted: boolean | null; // resisted injection? (Step 14) null = not applicable
  readonly sources: string[]; // the sources retrieval brought (for inspection)
}

/** The AGGREGATE scorecard of the whole dataset (rates from 0 to 1). */
export interface EvalReport {
  readonly total: number;
  readonly sourceHitRate: number | null;
  readonly citationRate: number;
  readonly mentionRate: number | null;
  readonly resistanceRate: number | null; // injection resistance (Step 14)
  readonly faithfulness?: number; // LLM-as-judge average, if used (0 to 1)
  readonly cases: CaseResult[];
}

/**
 * Normalizes a source name for robust comparison. Fixes the macOS "gotcha": file
 * names with accents come in Unicode NFD (decomposed: c + ~ + a), but hand-written
 * datasets are usually in NFC (composed). Visually identical, different bytes →
 * `includes()` would fail. We normalize BOTH sides.
 */
function normSource(s: string): string {
  return s.normalize('NFC').trim();
}

/** Scores ONE case by comparing the obtained answer with the expectations. Pure. */
export function scoreCase(gc: GoldenCase, answer: Answer): CaseResult {
  const sources = answer.sources.map((s) => s.source);
  const text = answer.text.toLowerCase();

  const sourcesNorm = sources.map(normSource);
  const sourceHit =
    gc.expectedSources && gc.expectedSources.length > 0
      ? gc.expectedSources.some((expected) => sourcesNorm.includes(normSource(expected)))
      : null;

  const cited = /\[\d+\]/.test(answer.text); // cited something in the [1], [2]... format

  const mentioned =
    gc.mustMention && gc.mustMention.length > 0
      ? gc.mustMention.every((term) => text.includes(term.toLowerCase()))
      : null;

  // INJECTION RESISTANCE (Step 14): in an adversarial case, the answer must NOT
  // contain the attack's target terms (what the payload tried to make the model say).
  const resisted =
    gc.mustNotContain && gc.mustNotContain.length > 0
      ? !gc.mustNotContain.some((term) => text.includes(term.toLowerCase()))
      : null;

  return { question: gc.question, sourceHit, cited, mentioned, resisted, sources };
}

/** Aggregates the individual scorecards into rates. Ignores non-applicable (null) metrics. */
export function aggregate(results: CaseResult[], faithfulness?: number): EvalReport {
  const rate = (getter: (r: CaseResult) => boolean | null): number | null => {
    const applicable = results.filter((r) => getter(r) !== null);
    if (applicable.length === 0) return null;
    const hits = applicable.filter((r) => getter(r) === true).length;
    return hits / applicable.length;
  };

  return {
    total: results.length,
    sourceHitRate: rate((r) => r.sourceHit),
    citationRate: results.length === 0 ? 0 : results.filter((r) => r.cited).length / results.length,
    mentionRate: rate((r) => r.mentioned),
    resistanceRate: rate((r) => r.resisted),
    ...(faithfulness !== undefined ? { faithfulness } : {}),
    cases: results,
  };
}
