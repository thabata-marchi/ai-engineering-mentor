// ============================================================================
//  ask.ts — RODAR O MENTOR DE VERDADE (embedder local + LLM via OpenRouter)
// ============================================================================
//
//  Este é o "ponto de montagem" (composition root): o lugar onde escolhemos as
//  implementações REAIS e as plugamos no caso de uso. É aqui — e só aqui — que
//  lemos variáveis de ambiente (a chave da API).
//
//  PRÉ-REQUISITOS (uma vez):
//    1. npm install                      → baixa a transformers.js
//    2. crie uma chave em https://openrouter.ai/keys
//    3. export OPENROUTER_API_KEY="sk-or-..."   (no terminal)
//
//  COMO RODAR:
//    npm run ask -- "o que é o single responsibility principle?"
//  (a 1ª execução baixa o modelo de embeddings; depois fica em cache)
// ============================================================================

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { TextFileParser } from '../src/adapters/textFileParser.ts';
import { SlidingWindowChunker } from '../src/core/chunker.ts';
import { InMemoryVectorStore } from '../src/adapters/inMemoryVectorStore.ts';
import { LocalEmbedder } from '../src/adapters/localEmbedder.ts';
import { OpenRouterLLM } from '../src/adapters/openRouterLLM.ts';
import { AnswerQuestion } from '../src/application/answerQuestion.ts';

const DOCS_DIR = new URL('./docs/', import.meta.url).pathname;

async function main() {
  // A pergunta vem da linha de comando.
  const pergunta = process.argv.slice(2).join(' ').trim();
  if (!pergunta) {
    console.error('Uso: npm run ask -- "sua pergunta aqui"');
    process.exit(1);
  }

  // A chave vem do ambiente (nunca do código).
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('❌ Defina OPENROUTER_API_KEY. Crie uma em https://openrouter.ai/keys');
    process.exit(1);
  }

  // Escolhemos as implementações REAIS (todas respeitam os ports).
  const parser = new TextFileParser();
  const chunker = new SlidingWindowChunker({ chunkSizeWords: 60, overlapWords: 10 });
  const embedder = new LocalEmbedder();
  const store = new InMemoryVectorStore();
  const llm = new OpenRouterLLM({ apiKey, model: process.env.OPENROUTER_MODEL });

  // ---------- INGESTÃO ----------
  console.log('⏳ Carregando embeddings e indexando a base (1ª vez baixa o modelo)...');
  const files = (await readdir(DOCS_DIR)).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const doc = await parser.parse(join(DOCS_DIR, file));
    const chunks = chunker.chunk(doc);
    const embeddings = await embedder.embed(chunks.map((c) => c.text));
    await store.add(chunks, embeddings);
  }

  // ---------- PERGUNTA → RESPOSTA COM FONTES ----------
  const useCase = new AnswerQuestion({ embedder, store, llm, topK: 3 });
  console.log(`\n❓ ${pergunta}\n`);
  const answer = await useCase.execute(pergunta);

  console.log(answer.text);
  console.log('\n📚 Fontes:');
  answer.sources.forEach((s, i) => {
    console.log(`  [${i + 1}] ${s.source} (chunk #${s.position})`);
  });
}

main().catch((err) => {
  console.error('\n💥 Erro:', err.message);
  process.exit(1);
});
