// ============================================================================
//  ask.ts — UMA pergunta, UMA resposta (modo tiro único)
// ============================================================================
//  Pré-requisitos: npm install + OPENROUTER_API_KEY no .env.
//  Rodar:  npm run ask -- "o que é o single responsibility principle?"
//  (Para CONVERSAR com memória, use `npm run chat`.)
// ============================================================================

import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { setupMentor } from './setup.ts';

async function main() {
  const pergunta = process.argv.slice(2).join(' ').trim();
  if (!pergunta) {
    console.error('Uso: npm run ask -- "sua pergunta aqui"');
    process.exit(1);
  }

  // A chave é resolvida pelo provedor escolhido (LLM_PROVIDER) dentro do setup.
  const mentor = await setupMentor();
  const useCase = new AnswerQuestion({
    embedder: mentor.embedder,
    store: mentor.store,
    llm: mentor.llm,
    topK: mentor.topK,
    mode: mentor.mode,
  });

  console.log(`🎓 Modo: ${mentor.mode} | 🗄️  Store: ${mentor.usingMongo ? 'MongoDB' : 'memória'}`);
  console.log(`\n❓ ${pergunta}\n`);
  const answer = await useCase.execute(pergunta); // sem sessionId = sem memória

  console.log(answer.text);
  console.log('\n📚 Fontes:');
  answer.sources.forEach((s, i) => {
    console.log(`  [${i + 1}] ${s.source} (chunk #${s.position})`);
  });

  await mentor.cleanup();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n💥 Erro:', err.message);
    process.exit(1);
  });
