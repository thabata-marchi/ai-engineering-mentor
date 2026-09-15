// ============================================================================
//  eval.ts — RODAR a AVALIAÇÃO (Etapa 13): mede a qualidade do mentor
// ============================================================================
//
//  Lê o "dataset dourado" (examples/golden.json), roda cada pergunta pelo mentor
//  REAL e imprime um placar com as métricas determinísticas (source-hit, citação,
//  menção). Opcionalmente liga o LLM-as-judge (fidelidade) — que gasta cota.
//
//  Rodar:            npm run eval
//  Com juiz (LLM):   EVAL_JUDGE=1 npm run eval
//  Com trace ao vivo: EVAL_TRACE=1 npm run eval
//
//  Nota: forçamos MODE=direto aqui — no modo socrático o mentor faz perguntas em
//  vez de explicar, o que atrapalharia as métricas de menção/citação. O
//  source-hit (qualidade do retrieval) independe do modo.
// ============================================================================

import { readFile } from 'node:fs/promises';

import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { LLMJudge } from '../src/adapters/llmJudge.ts';
import { ConsoleTracer } from '../src/core/tracing.ts';
import { scoreCase, aggregate, type GoldenCase, type CaseResult } from '../src/core/eval.ts';
import { setupMentor } from './setup.ts';

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('❌ Defina OPENROUTER_API_KEY. Crie uma em https://openrouter.ai/keys');
    process.exit(1);
  }

  const datasetPath = new URL('./golden.json', import.meta.url).pathname;
  const cases = JSON.parse(await readFile(datasetPath, 'utf8')) as GoldenCase[];

  const mentor = await setupMentor(apiKey);
  const useCase = new AnswerQuestion({
    embedder: mentor.embedder,
    store: mentor.store,
    llm: mentor.llm,
    topK: mentor.topK,
    mode: 'direto', // explicativo → métricas de menção/citação fazem sentido
    tracer: process.env.EVAL_TRACE ? new ConsoleTracer() : undefined,
  });

  const usarJuiz = process.env.EVAL_JUDGE === '1';
  const juiz = usarJuiz ? new LLMJudge(mentor.llm) : undefined;

  console.error(`🧪 Avaliando ${cases.length} caso(s)${usarJuiz ? ' (com LLM-as-judge)' : ''}...\n`);

  const results: CaseResult[] = [];
  const notasJuiz: number[] = [];

  try {
    for (const gc of cases) {
      const answer = await useCase.execute(gc.question);
      const r = scoreCase(gc, answer);
      results.push(r);

      const marca = (b: boolean | null) => (b === null ? '–' : b ? '✅' : '❌');
      console.log(
        `• ${gc.question}\n  fonte:${marca(r.sourceHit)} citou:${marca(r.cited)} menção:${marca(r.mentioned)} resistiu:${marca(r.resisted)}  [fontes: ${r.sources.join(', ') || 'nenhuma'}]`,
      );

      if (juiz) {
        // Reconstrói o contexto recuperado (para o juiz avaliar a fidelidade).
        const [qv] = await mentor.embedder.embed([gc.question]);
        const ctx = await mentor.store.search(qv, mentor.topK);
        const contexto = ctx.chunks.map((c) => c.chunk.text).join('\n\n');
        const nota = await juiz.faithfulness(gc.question, answer.text, contexto);
        notasJuiz.push(nota);
        console.log(`  fidelidade (juiz): ${nota.toFixed(2)}`);
      }
    }

    const faithfulness =
      notasJuiz.length > 0 ? notasJuiz.reduce((a, b) => a + b, 0) / notasJuiz.length : undefined;
    const rep = aggregate(results, faithfulness);

    const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(0)}%`);
    console.log('\n📊 Placar:');
    console.log(`  casos:        ${rep.total}`);
    console.log(`  source-hit:   ${pct(rep.sourceHitRate)}  (fonte esperada apareceu no retrieval)`);
    console.log(`  citação:      ${pct(rep.citationRate)}  (resposta citou [n])`);
    console.log(`  menção:       ${pct(rep.mentionRate)}  (mencionou os termos-chave)`);
    console.log(`  resistência:  ${pct(rep.resistanceRate)}  (resistiu à injeção nos casos adversariais)`);
    if (rep.faithfulness !== undefined) {
      console.log(`  fidelidade:   ${(rep.faithfulness * 100).toFixed(0)}%  (média do LLM-as-judge)`);
    }
  } finally {
    await mentor.cleanup();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n💥 Erro:', err.message);
    process.exit(1);
  });
