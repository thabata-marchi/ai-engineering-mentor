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

import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { FileParser } from '../src/adapters/fileParser.ts';
import { SlidingWindowChunker } from '../src/core/chunker.ts';
import { InMemoryVectorStore } from '../src/adapters/inMemoryVectorStore.ts';
import { LocalEmbedder } from '../src/adapters/localEmbedder.ts';
import { OpenRouterLLM } from '../src/adapters/openRouterLLM.ts';
import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import { loadIndex, saveIndex } from '../src/adapters/indexCache.ts';

// Onde o índice fica salvo (pasta ignorada pelo Git). Reindexa só quando muda.
const CACHE_PATH = resolve(process.cwd(), 'data/vectorstore/index.json');

const CHUNK_CONFIG = { chunkSizeWords: 200, overlapWords: 30 };

// Quantos chunks embedar por vez (lote). Menor = mais estável na memória.
const BATCH_SIZE = 32;

// Limite opcional de chunks (MAX_CHUNKS no .env) — pra testar rápido só uma parte.
const MAX_CHUNKS = process.env.MAX_CHUNKS ? Number(process.env.MAX_CHUNKS) : Infinity;

// Pasta da base de conhecimento. Padrão: examples/docs. Você pode apontar pra
// SUA pasta de materiais definindo DOCS_DIR no .env (ex.: DOCS_DIR=./data).
const DEFAULT_DIR = new URL('./docs/', import.meta.url).pathname;
const DOCS_DIR = process.env.DOCS_DIR
  ? isAbsolute(process.env.DOCS_DIR)
    ? process.env.DOCS_DIR
    : resolve(process.cwd(), process.env.DOCS_DIR)
  : DEFAULT_DIR;

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
  const parser = new FileParser(); // agora lê .md, .txt E .pdf
  const chunker = new SlidingWindowChunker(CHUNK_CONFIG);
  // Precisão do embedder: padrão 'q8' (rápido). Troque com EMBEDDER_DTYPE no .env.
  const dtype = (process.env.EMBEDDER_DTYPE as 'q8' | 'fp16' | 'fp32') || 'q8';
  const embedder = new LocalEmbedder(dtype);
  const store = new InMemoryVectorStore();
  const llm = new OpenRouterLLM({ apiKey, model: process.env.OPENROUTER_MODEL });

  // ---------- INGESTÃO (com cache em disco) ----------
  const files = (await readdir(DOCS_DIR)).filter((f) => FileParser.suporta(f));
  if (files.length === 0) {
    console.error(`❌ Nenhum arquivo suportado (.pdf/.md/.txt) em: ${DOCS_DIR}`);
    process.exit(1);
  }

  // "Impressão digital" da entrada: se nada mudou, reusamos o índice salvo.
  const signature = await buildSignature(files, dtype);
  const cache = await loadIndex(CACHE_PATH);

  if (cache && cache.signature === signature) {
    // CAMINHO RÁPIDO: carrega o índice pronto do disco (sem reindexar!).
    store.restore(cache.entries);
    console.log(`⚡ Índice carregado do cache (${cache.entries.length} chunks). Sem reindexar.`);
  } else {
    // CAMINHO LENTO (1ª vez ou algo mudou): indexa e salva pra próxima.
    console.log(`⏳ Indexando ${files.length} arquivo(s) de ${DOCS_DIR}`);
    console.log('   (a 1ª vez baixa o modelo de embeddings; depois vai mais rápido)');
    for (const file of files) {
      const doc = await parser.parse(join(DOCS_DIR, file));
      let chunks = chunker.chunk(doc);

      // Limite opcional (MAX_CHUNKS) — ótimo pra TESTAR rápido só uma parte.
      if (chunks.length > MAX_CHUNKS) {
        chunks = chunks.slice(0, MAX_CHUNKS);
        console.log(`   ${file}: limitado a ${MAX_CHUNKS} chunks (MAX_CHUNKS)`);
      }

      // Embedamos em LOTES (batches) e mostramos progresso ao vivo — assim você
      // vê andando em vez de parecer travado, e a memória fica sob controle.
      console.log(`   ${file}: ${chunks.length} chunks — gerando embeddings...`);
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const lote = chunks.slice(i, i + BATCH_SIZE);
        const embeddings = await embedder.embed(lote.map((c) => c.text));
        await store.add(lote, embeddings);
        const feitos = Math.min(i + BATCH_SIZE, chunks.length);
        process.stdout.write(`\r      ${feitos}/${chunks.length}`);
      }
      process.stdout.write('\n');
    }
    await saveIndex(CACHE_PATH, { signature, entries: store.snapshot() });
    console.log('💾 Índice salvo em cache. As próximas execuções serão instantâneas.');
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

/**
 * Monta a assinatura da entrada: nome+tamanho+data de cada arquivo + a config de
 * chunking + a precisão. Se qualquer um mudar, a assinatura muda → reindexa.
 */
async function buildSignature(files: string[], dtype: string): Promise<string> {
  const parts: string[] = [
    `chunk=${JSON.stringify(CHUNK_CONFIG)}`,
    `dtype=${dtype}`,
    `max=${MAX_CHUNKS}`,
  ];
  for (const file of files.sort()) {
    const info = await stat(join(DOCS_DIR, file));
    parts.push(`${file}:${info.size}:${Math.round(info.mtimeMs)}`);
  }
  return parts.join('|');
}

main()
  .then(() => process.exit(0)) // saída limpa (evita o crash nativo do onnxruntime)
  .catch((err) => {
    console.error('\n💥 Erro:', err.message);
    process.exit(1);
  });
