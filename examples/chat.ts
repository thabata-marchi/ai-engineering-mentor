// ============================================================================
//  chat.ts — CONVERSATION MODE (multi-turn, with memory) — Step 8
// ============================================================================
//
//  Unlike `ask.ts` (one question and done), here we open a LOOP: you talk, the
//  mentor REMEMBERS the previous turns (via MemoryPort) and drives the dialogue.
//  With VECTOR_STORE=mongo, the conversation is SAVED in Mongo (the `conversations`
//  collection) — you can see it in Mongo Express.
//
//  Run:   npm run chat
//  Quit:  type "exit" (or Ctrl+C). Session: SESSION_ID in .env (default "default").
//  Profile: type "/progress" to see what you've been studying (Step 10).
// ============================================================================

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { setupMentor } from './setup.ts';

async function main() {
  // The key is resolved by the chosen provider (LLM_PROVIDER) inside setup.
  const mentor = await setupMentor();
  const useCase = new AnswerQuestion({
    embedder: mentor.embedder,
    store: mentor.store,
    llm: mentor.llm,
    memory: mentor.memory, // <- memory comes in here
    profile: mentor.profile, // <- records the study profile (Step 10)
    topK: mentor.topK,
    mode: mentor.mode,
    lang: mentor.lang,
  });

  // The session identifies the conversation. Fixed by default, so the history
  // persists between runs (useful with Mongo). Change it with SESSION_ID in .env.
  const sessionId = process.env.SESSION_ID ?? 'default';

  console.log(
    `🎓 Mode: ${mentor.mode} | 🗄️  Store: ${mentor.usingMongo ? 'MongoDB' : 'memory'} | 🧠 session: ${sessionId}`,
  );
  console.log('💬 Conversation mode. Type your question (or "exit" to quit).');
  console.log('   Tip: "/progress" shows what you have been studying.\n');

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    for (;;) {
      const question = (await rl.question('you › ')).trim();
      if (!question) continue;
      if (['exit', 'quit', 'sair'].includes(question.toLowerCase())) break;

      // Command: shows the study-profile summary, without calling the LLM.
      if (question.toLowerCase() === '/progress' || question.toLowerCase() === '/progresso') {
        const summary = await mentor.profile.summary(sessionId);
        if (summary.total === 0) {
          console.log('\n📈 No studies recorded in this session yet.\n');
        } else {
          const sources = summary.bySource.map((f) => `   - ${f.source}: ${f.count}x`).join('\n');
          const recent = summary.recent.map((q, i) => `   ${i + 1}. ${q}`).join('\n');
          console.log(
            `\n📈 Progress (${summary.total} question(s))\n` +
              `Most consulted sources:\n${sources}\n` +
              `Recent questions:\n${recent}\n`,
          );
        }
        continue;
      }

      const answer = await useCase.execute(question, sessionId); // <- passes the session
      console.log(`\nmentor › ${answer.text}`);
      if (answer.sources.length > 0) {
        const sources = answer.sources.map((s, i) => `[${i + 1}] ${s.source}#${s.position}`).join('  ');
        console.log(`📚 ${sources}`);
      }
      console.log('');
    }
  } finally {
    rl.close();
    await mentor.cleanup();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n💥 Error:', err.message);
    process.exit(1);
  });
