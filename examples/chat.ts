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
//  Perfil: digite "/progresso" pra ver o que você vem estudando (Etapa 10).
// ============================================================================

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { setupMentor } from './setup.ts';

async function main() {
  // A chave é resolvida pelo provedor escolhido (LLM_PROVIDER) dentro do setup.
  const mentor = await setupMentor();
  const useCase = new AnswerQuestion({
    embedder: mentor.embedder,
    store: mentor.store,
    llm: mentor.llm,
    memory: mentor.memory, // <- a memória entra aqui
    profile: mentor.profile, // <- registra o perfil de estudo (Etapa 10)
    topK: mentor.topK,
    mode: mentor.mode,
    lang: mentor.lang,
  });

  // A sessão identifica a conversa. Fixa por padrão, então o histórico persiste
  // entre execuções (útil com Mongo). Troque com SESSION_ID no .env.
  const sessionId = process.env.SESSION_ID ?? 'default';

  console.log(
    `🎓 Modo: ${mentor.mode} | 🗄️  Store: ${mentor.usingMongo ? 'MongoDB' : 'memória'} | 🧠 sessão: ${sessionId}`,
  );
  console.log('💬 Modo conversa. Escreva sua pergunta (ou "sair" para encerrar).');
  console.log('   Dica: "/progresso" mostra o que você vem estudando.\n');

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    for (;;) {
      const pergunta = (await rl.question('você › ')).trim();
      if (!pergunta) continue;
      if (['sair', 'exit', 'quit'].includes(pergunta.toLowerCase())) break;

      // Comando: mostra o resumo do perfil de estudo, sem chamar o LLM.
      if (pergunta.toLowerCase() === '/progresso') {
        const resumo = await mentor.profile.summary(sessionId);
        if (resumo.total === 0) {
          console.log('\n📈 Ainda não há estudos registrados nesta sessão.\n');
        } else {
          const fontes = resumo.porFonte.map((f) => `   - ${f.source}: ${f.count}x`).join('\n');
          const ultimas = resumo.ultimas.map((q, i) => `   ${i + 1}. ${q}`).join('\n');
          console.log(
            `\n📈 Progresso (${resumo.total} pergunta(s))\n` +
              `Fontes mais consultadas:\n${fontes}\n` +
              `Últimas perguntas:\n${ultimas}\n`,
          );
        }
        continue;
      }

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
