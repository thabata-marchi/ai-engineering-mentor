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
import { isAbsolute, resolve } from 'node:path';

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

  // Dataset: aceita um caminho como argumento (ex.: `npm run eval -- examples/golden.fowler.json`).
  // Sem argumento, usa o golden.json padrão (pareado com examples/docs).
  // ⚠️ O dataset PRECISA casar com a base (DOCS_DIR): as `expectedSources` são os
  // nomes dos arquivos indexados. Dataset e base descasados → source-hit 0%.
  const arg = process.argv.slice(2)[0];
  const datasetPath = arg
    ? isAbsolute(arg)
      ? arg
      : resolve(process.cwd(), arg)
    : new URL('./golden.json', import.meta.url).pathname;
  const cases = JSON.parse(await readFile(datasetPath, 'utf8')) as GoldenCase[];
  console.error(`📁 Dataset: ${datasetPath}`);

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

  // EVAL_RUNS: quantas vezes rodar CADA caso, para MÉDIA (reduz o ruído do modelo
  // grátis — uma rodada só não é confiável). Padrão: 1.
  const runs = Math.max(1, Math.floor(Number(process.env.EVAL_RUNS ?? '1')) || 1);

  console.error(
    `🧪 Avaliando ${cases.length} caso(s)${usarJuiz ? ' (com LLM-as-judge)' : ''}` +
      `${runs > 1 ? ` — ${runs} rodadas por caso (média)` : ''}...\n`,
  );

  // Coletamos TODAS as execuções num só array; o aggregate() calcula as taxas
  // sobre tudo — ou seja, a média entre rodadas sai naturalmente.
  const results: CaseResult[] = [];
  const notasJuiz: number[] = [];

  // Conta "k/n" de uma métrica booleana num conjunto de rodadas (ignora null).
  const conta = (rs: CaseResult[], get: (r: CaseResult) => boolean | null): string => {
    const aplic = rs.filter((r) => get(r) !== null);
    if (aplic.length === 0) return '–';
    return `${aplic.filter((r) => get(r) === true).length}/${aplic.length}`;
  };

  try {
    for (const gc of cases) {
      const casoAdversarial = Boolean(gc.mustNotContain && gc.mustNotContain.length > 0);

      // O contexto para o juiz é o mesmo em todas as rodadas (retrieval é
      // determinístico p/ a mesma pergunta) → calculamos UMA vez.
      let contexto = '';
      if (juiz && !casoAdversarial) {
        const [qv] = await mentor.embedder.embed([gc.question]);
        const ctx = await mentor.store.search(qv, mentor.topK);
        contexto = ctx.chunks.map((c) => c.chunk.text).join('\n\n');
      }

      const rodadasCaso: CaseResult[] = [];
      const notasCaso: number[] = [];
      for (let i = 0; i < runs; i++) {
        const answer = await useCase.execute(gc.question);
        const r = scoreCase(gc, answer);
        rodadasCaso.push(r);
        results.push(r);
        if (juiz && !casoAdversarial) {
          const nota = await juiz.faithfulness(gc.question, answer.text, contexto);
          notasCaso.push(nota);
          notasJuiz.push(nota);
        }
      }

      // Linha-resumo do caso. Com 1 rodada, usa ✅/❌; com N, mostra "k/n".
      const marca = (b: boolean | null) => (b === null ? '–' : b ? '✅' : '❌');
      const cel = (get: (r: CaseResult) => boolean | null) =>
        runs === 1 ? marca(get(rodadasCaso[0])) : conta(rodadasCaso, get);
      console.log(
        `• ${gc.question}\n  fonte:${cel((r) => r.sourceHit)} citou:${cel((r) => r.cited)} menção:${cel((r) => r.mentioned)} resistiu:${cel((r) => r.resisted)}`,
      );
      if (notasCaso.length > 0) {
        const media = notasCaso.reduce((a, b) => a + b, 0) / notasCaso.length;
        console.log(`  fidelidade (juiz): ${media.toFixed(2)}${runs > 1 ? ` (média de ${runs})` : ''}`);
      }
    }

    const faithfulness =
      notasJuiz.length > 0 ? notasJuiz.reduce((a, b) => a + b, 0) / notasJuiz.length : undefined;
    const rep = aggregate(results, faithfulness);

    const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(0)}%`);
    console.log('\n📊 Placar:');
    console.log(
      `  casos:        ${cases.length}${runs > 1 ? ` × ${runs} rodadas = ${rep.total} execuções` : ''}`,
    );
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
