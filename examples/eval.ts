// ============================================================================
//  eval.ts — RUN the EVALUATION (Step 13): measures the mentor's quality
// ============================================================================
//
//  Reads the "golden dataset" (examples/golden.json), runs each question through
//  the REAL mentor and prints a scorecard with the deterministic metrics (source-hit,
//  citation, mention). Optionally enables the LLM-as-judge (faithfulness) — which
//  uses quota.
//
//  Run:              npm run eval
//  With judge (LLM): EVAL_JUDGE=1 npm run eval
//  Average N runs:   EVAL_RUNS=3 npm run eval
//  With live trace:  EVAL_TRACE=1 npm run eval
//
//  Note: we force MODE=direct here — in Socratic mode the mentor asks questions
//  instead of explaining, which would hurt the mention/citation metrics. Source-hit
//  (retrieval quality) is independent of the mode.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { LLMJudge } from '../src/adapters/llmJudge.ts';
import { ConsoleTracer } from '../src/core/tracing.ts';
import { scoreCase, aggregate, type GoldenCase, type CaseResult } from '../src/core/eval.ts';
import { setupMentor } from './setup.ts';

async function main() {
  // Dataset: accepts a path as an argument (e.g. `npm run eval -- examples/golden.fowler.json`).
  // Without an argument, uses the default golden.json (paired with examples/docs).
  // ⚠️ The dataset MUST match the base (DOCS_DIR): `expectedSources` are the names
  // of the indexed files. Mismatched dataset/base → source-hit 0%.
  const arg = process.argv.slice(2)[0];
  const datasetPath = arg
    ? isAbsolute(arg)
      ? arg
      : resolve(process.cwd(), arg)
    : new URL('./golden.json', import.meta.url).pathname;
  const cases = JSON.parse(await readFile(datasetPath, 'utf8')) as GoldenCase[];
  console.error(`📁 Dataset: ${datasetPath}`);

  const mentor = await setupMentor();
  const useCase = new AnswerQuestion({
    embedder: mentor.embedder,
    store: mentor.store,
    llm: mentor.llm,
    topK: mentor.topK,
    mode: 'direct', // explanatory → mention/citation metrics make sense
    lang: mentor.lang,
    tracer: process.env.EVAL_TRACE ? new ConsoleTracer() : undefined,
  });

  const useJudge = process.env.EVAL_JUDGE === '1';
  const judge = useJudge ? new LLMJudge(mentor.llm) : undefined;

  // EVAL_RUNS: how many times to run EACH case, for an AVERAGE (reduces the noise of
  // free models — a single run isn't reliable). Default: 1.
  const runs = Math.max(1, Math.floor(Number(process.env.EVAL_RUNS ?? '1')) || 1);

  console.error(
    `🧪 Evaluating ${cases.length} case(s)${useJudge ? ' (with LLM-as-judge)' : ''}` +
      `${runs > 1 ? ` — ${runs} runs per case (average)` : ''}...\n`,
  );

  // We collect ALL executions into a single array; aggregate() computes the rates
  // over everything — i.e. the average between runs comes out naturally.
  const results: CaseResult[] = [];
  const judgeScores: number[] = [];
  // Robustness: a call that fails (e.g. a 429 for quota) does NOT bring down the
  // evaluation. We count the failures and continue; metrics reflect what ran.
  let genErrors = 0;
  let judgeErrors = 0;

  // Counts "k/n" of a boolean metric over a set of runs (ignores null).
  const count = (rs: CaseResult[], get: (r: CaseResult) => boolean | null): string => {
    const applicable = rs.filter((r) => get(r) !== null);
    if (applicable.length === 0) return '–';
    return `${applicable.filter((r) => get(r) === true).length}/${applicable.length}`;
  };

  try {
    for (const gc of cases) {
      const adversarialCase = Boolean(gc.mustNotContain && gc.mustNotContain.length > 0);

      // The context for the judge is the same across all runs (retrieval is
      // deterministic for the same question) → we compute it ONCE.
      let context = '';
      if (judge && !adversarialCase) {
        const [qv] = await mentor.embedder.embed([gc.question]);
        const ctx = await mentor.store.search(qv, mentor.topK);
        context = ctx.chunks.map((c) => c.chunk.text).join('\n\n');
      }

      const caseRounds: CaseResult[] = [];
      const caseScores: number[] = [];
      for (let i = 0; i < runs; i++) {
        let answer;
        try {
          answer = await useCase.execute(gc.question);
        } catch (err) {
          genErrors++;
          console.log(`  ⚠️ run ${i + 1}/${runs} failed: ${short(err)}`);
          continue; // don't bring down the rest — move to the next run/case
        }
        const r = scoreCase(gc, answer);
        caseRounds.push(r);
        results.push(r);
        if (judge && !adversarialCase) {
          try {
            const score = await judge.faithfulness(gc.question, answer.text, context);
            caseScores.push(score);
            judgeScores.push(score);
          } catch (err) {
            judgeErrors++;
            console.log(`  ⚠️ judge failed on run ${i + 1}: ${short(err)}`);
          }
        }
      }

      // Case summary line. With 1 run, uses ✅/❌; with N, shows "k/n".
      if (caseRounds.length === 0) {
        console.log(`• ${gc.question}\n  ⚠️ no run completed (all failed)`);
        continue;
      }
      const mark = (b: boolean | null) => (b === null ? '–' : b ? '✅' : '❌');
      const cell = (get: (r: CaseResult) => boolean | null) =>
        caseRounds.length === 1 ? mark(get(caseRounds[0])) : count(caseRounds, get);
      console.log(
        `• ${gc.question}\n  source:${cell((r) => r.sourceHit)} cited:${cell((r) => r.cited)} mention:${cell((r) => r.mentioned)} resisted:${cell((r) => r.resisted)}`,
      );
      if (caseScores.length > 0) {
        const avg = caseScores.reduce((a, b) => a + b, 0) / caseScores.length;
        console.log(
          `  faithfulness (judge): ${avg.toFixed(2)}${caseScores.length > 1 ? ` (avg of ${caseScores.length})` : ''}`,
        );
      }
    }

    const faithfulness =
      judgeScores.length > 0 ? judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length : undefined;
    const rep = aggregate(results, faithfulness);

    const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(0)}%`);
    console.log('\n📊 Scorecard:');
    console.log(
      `  cases:        ${cases.length}${runs > 1 ? ` × ${runs} runs` : ''} — ${rep.total} execution(s) completed`,
    );
    console.log(`  source-hit:   ${pct(rep.sourceHitRate)}  (expected source showed up in retrieval)`);
    console.log(`  citation:     ${pct(rep.citationRate)}  (answer cited [n])`);
    console.log(`  mention:      ${pct(rep.mentionRate)}  (mentioned the key terms)`);
    console.log(`  resistance:   ${pct(rep.resistanceRate)}  (resisted injection in the adversarial cases)`);
    if (rep.faithfulness !== undefined) {
      console.log(`  faithfulness: ${(rep.faithfulness * 100).toFixed(0)}%  (LLM-as-judge average)`);
    }
    if (genErrors > 0 || judgeErrors > 0) {
      console.log(
        `  ⚠️ failures:  ${genErrors} generation${judge ? ` + ${judgeErrors} judge` : ''} ` +
          `(e.g. 429/quota). The metrics above reflect only the executions that completed.`,
      );
    }
  } finally {
    await mentor.cleanup();
  }
}

/** Short (1-line) error message for the log — avoids dumping the whole JSON. */
function short(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 140 ? msg.slice(0, 140) + '…' : msg;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n💥 Error:', err.message);
    process.exit(1);
  });
