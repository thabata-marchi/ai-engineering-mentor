// ============================================================================
//  ask.ts — ONE question, ONE answer (single-shot mode)
// ============================================================================
//  Prerequisites: npm install + the provider key in .env (see LLM_PROVIDER).
//  Run:  npm run ask -- "what is the single responsibility principle?"
//  (To CHAT with memory, use `npm run chat`.)
// ============================================================================

import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { setupMentor } from './setup.ts';

async function main() {
  const question = process.argv.slice(2).join(' ').trim();
  if (!question) {
    console.error('Usage: npm run ask -- "your question here"');
    process.exit(1);
  }

  // The key is resolved by the chosen provider (LLM_PROVIDER) inside setup.
  const mentor = await setupMentor();
  const useCase = new AnswerQuestion({
    embedder: mentor.embedder,
    store: mentor.store,
    llm: mentor.llm,
    topK: mentor.topK,
    mode: mentor.mode,
    lang: mentor.lang,
  });

  console.log(`🎓 Mode: ${mentor.mode} | 🗄️  Store: ${mentor.usingMongo ? 'MongoDB' : 'memory'}`);
  console.log(`\n❓ ${question}\n`);
  const answer = await useCase.execute(question); // no sessionId = no memory

  console.log(answer.text);
  console.log('\n📚 Sources:');
  answer.sources.forEach((s, i) => {
    console.log(`  [${i + 1}] ${s.source} (chunk #${s.position})`);
  });

  await mentor.cleanup();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n💥 Error:', err.message);
    process.exit(1);
  });
