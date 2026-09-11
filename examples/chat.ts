// ============================================================================
//  chat.ts — MODO CONVERSA (multi-turno, com memória) — Etapa 8
// ============================================================================
//
//  Diferente do `ask.ts` (uma pergunta e acabou), aqui abrimos um LOOP: você
//  conversa, o mentor LEMBRA dos turnos anteriores (via MemoryPort) e conduz o
//  diálogo. Com VECTOR_STORE=mongo, a conversa fica SALVA no Mongo (coleção
//  `conversations`) — dá pra ver no Mongo Express.
//
//  Rodar:  npm run chat
//  Sair:   digite "sair" (ou Ctrl+C). Sessão: SESSION_ID no .env (padrão "default").
// ============================================================================

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { setupMentor } from './setup.ts';

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('❌ Defina OPENROUTER_API_KEY. Crie uma em https://openrouter.ai/keys');
    process.exit(1);
  }

  const mentor = await setupMentor(apiKey);
  const useCase = new AnswerQuestion({
    embedder: mentor.embedder,
    store: mentor.store,
    llm: mentor.llm,
    memory: mentor.memory, // <- a memória entra aqui
    topK: mentor.topK,
    mode: mentor.mode,
  });

  // A sessão identifica a conversa. Fixa por padrão, então o histórico persiste
  // entre execuções (útil com Mongo). Troque com SESSION_ID no .env.
  const sessionId = process.env.SESSION_ID ?? 'default';

  console.log(
    `🎓 Modo: ${mentor.mode} | 🗄️  Store: ${mentor.usingMongo ? 'MongoDB' : 'memória'} | 🧠 sessão: ${sessionId}`,
  );
  console.log('💬 Modo conversa. Escreva sua pergunta (ou "sair" para encerrar).\n');

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    for (;;) {
      const pergunta = (await rl.question('você › ')).trim();
      if (!pergunta) continue;
      if (['sair', 'exit', 'quit'].includes(pergunta.toLowerCase())) break;

      const answer = await useCase.execute(pergunta, sessionId); // <- passa a sessão
      console.log(`\nmentor › ${answer.text}`);
      if (answer.sources.length > 0) {
        const fontes = answer.sources.map((s, i) => `[${i + 1}] ${s.source}#${s.position}`).join('  ');
        console.log(`📚 ${fontes}`);
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
    console.error('\n💥 Erro:', err.message);
    process.exit(1);
  });
