// ============================================================================
//  setup.ts — "ponto de montagem" compartilhado (usado por ask.ts e chat.ts)
// ============================================================================
//
//  Aqui a gente escolhe as implementações REAIS conforme o ambiente (.env),
//  indexa a base uma vez e devolve tudo pronto. Assim os dois modos de uso
//  (uma pergunta = ask.ts; conversa = chat.ts) reaproveitam a MESMA montagem,
//  sem duplicar código.
// ============================================================================

import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { FileParser } from '../src/adapters/fileParser.ts';
import { SlidingWindowChunker } from '../src/core/chunker.ts';
import { InMemoryVectorStore } from '../src/adapters/inMemoryVectorStore.ts';
import { MongoVectorStore } from '../src/adapters/mongoVectorStore.ts';
import { InMemoryMemory } from '../src/adapters/inMemoryMemory.ts';
import { MongoMemory } from '../src/adapters/mongoMemory.ts';
import { InMemoryProfile } from '../src/adapters/inMemoryProfile.ts';
import { MongoProfile } from '../src/adapters/mongoProfile.ts';
import { LocalEmbedder, type EmbedderDtype } from '../src/adapters/localEmbedder.ts';
import { createLLMFromEnv } from '../src/adapters/llmFactory.ts';
import { RateLimitedLLM } from '../src/adapters/rateLimitedLLM.ts';
import { RateLimiter } from '../src/core/rateLimiter.ts';
import { loadIndex, saveIndex } from '../src/adapters/indexCache.ts';
import type { LLMPort, MemoryPort, ProfilePort, VectorStorePort } from '../src/core/ports.ts';
import type { MentorMode } from '../src/application/answerQuestion.ts';

const CACHE_PATH = resolve(process.cwd(), 'data/vectorstore/index.json');
const CHUNK_CONFIG = { chunkSizeWords: 200, overlapWords: 30 };
const BATCH_SIZE = 32;
const MAX_CHUNKS = process.env.MAX_CHUNKS ? Number(process.env.MAX_CHUNKS) : Infinity;

// Pasta da base. Padrão: examples/docs. Aponte pra sua pasta com DOCS_DIR.
const DEFAULT_DIR = new URL('./docs/', import.meta.url).pathname;
const DOCS_DIR = process.env.DOCS_DIR
  ? isAbsolute(process.env.DOCS_DIR)
    ? process.env.DOCS_DIR
    : resolve(process.cwd(), process.env.DOCS_DIR)
  : DEFAULT_DIR;

/** Tudo o que o mentor precisa, já montado e indexado. */
export interface Mentor {
  readonly embedder: LocalEmbedder;
  readonly store: VectorStorePort;
  readonly memory: MemoryPort;
  readonly profile: ProfilePort;
  readonly llm: LLMPort;
  readonly limiter: RateLimiter; // compartilhado (RAG + agente) p/ proteger a cota
  readonly topK: number;
  readonly mode: MentorMode;
  readonly usingMongo: boolean;
  cleanup(): Promise<void>;
}

export async function setupMentor(): Promise<Mentor> {
  const parser = new FileParser();
  const chunker = new SlidingWindowChunker(CHUNK_CONFIG);
  const dtype = (process.env.EMBEDDER_DTYPE as EmbedderDtype) || 'q8';
  const embedder = new LocalEmbedder(dtype);
  const timeoutMs = process.env.LLM_TIMEOUT_MS ? Number(process.env.LLM_TIMEOUT_MS) : 120_000;
  // Rate limit COMPARTILHADO: protege a cota do provedor (RAG + agente somam no
  // mesmo teto). Padrão generoso (20/min) — ajuste com RATE_LIMIT_MAX/WINDOW.
  const limiter = new RateLimiter({
    max: process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : 20,
    windowMs: process.env.RATE_LIMIT_WINDOW_MS ? Number(process.env.RATE_LIMIT_WINDOW_MS) : 60_000,
  });
  // Multi-provedor (Etapa 16): LLM_PROVIDER escolhe openrouter|openai|anthropic|gemini.
  // A factory resolve a chave/modelo por env e valida (guard de segredo embutido).
  const { llm: rawLlm, provider, model } = createLLMFromEnv(timeoutMs);
  const llm = new RateLimitedLLM(rawLlm, limiter);
  console.error(`🤖 Provedor: ${provider} | Modelo: ${model}`);

  const files = (await readdir(DOCS_DIR)).filter((f) => FileParser.suporta(f));
  if (files.length === 0) {
    throw new Error(`Nenhum arquivo suportado (.pdf/.md/.txt) em: ${DOCS_DIR}`);
  }
  const signature = await buildSignature(files, dtype);

  // Store e memória: memória (padrão) OU MongoDB (VECTOR_STORE=mongo).
  const usingMongo = process.env.VECTOR_STORE === 'mongo';
  const mongoUrl = process.env.MONGO_URL ?? 'mongodb://localhost:27017';
  const store: VectorStorePort = usingMongo
    ? new MongoVectorStore({ url: mongoUrl })
    : new InMemoryVectorStore();
  const memory: MemoryPort = usingMongo
    ? new MongoMemory({ url: mongoUrl })
    : new InMemoryMemory();
  const profile: ProfilePort = usingMongo
    ? new MongoProfile({ url: mongoUrl })
    : new InMemoryProfile();

  const deps: IngestDeps = { parser, chunker, embedder, files };
  if (usingMongo) {
    await prepareMongo(store as MongoVectorStore, signature, deps);
  } else {
    await prepareMemory(store as InMemoryVectorStore, signature, deps);
  }

  const topK = process.env.TOP_K ? Number(process.env.TOP_K) : 5;
  const mode: MentorMode = process.env.MODE === 'direto' ? 'direto' : 'guiado';

  return {
    embedder,
    store,
    memory,
    profile,
    llm,
    limiter,
    topK,
    mode,
    usingMongo,
    async cleanup() {
      await embedder.dispose();
      if (usingMongo) {
        await (store as MongoVectorStore).close();
        await (memory as MongoMemory).close();
        await (profile as MongoProfile).close();
      }
    },
  };
}

interface IngestDeps {
  readonly parser: FileParser;
  readonly chunker: SlidingWindowChunker;
  readonly embedder: LocalEmbedder;
  readonly files: string[];
}

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

async function indexDocs(store: VectorStorePort, deps: IngestDeps): Promise<void> {
  console.error(`⏳ Indexando ${deps.files.length} arquivo(s) de ${DOCS_DIR}`);
  console.error('   (a 1ª vez baixa o modelo de embeddings; depois vai mais rápido)');
  for (const file of deps.files) {
    const doc = await deps.parser.parse(join(DOCS_DIR, file));
    let chunks = deps.chunker.chunk(doc);
    if (chunks.length > MAX_CHUNKS) {
      chunks = chunks.slice(0, MAX_CHUNKS);
      console.error(`   ${file}: limitado a ${MAX_CHUNKS} chunks (MAX_CHUNKS)`);
    }
    console.error(`   ${file}: ${chunks.length} chunks — gerando embeddings...`);
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const lote = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await deps.embedder.embed(lote.map((c) => c.text));
      await store.add(lote, embeddings);
      process.stderr.write(`\r      ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}`);
    }
    process.stderr.write('\n');
  }
}

async function prepareMemory(
  store: InMemoryVectorStore,
  signature: string,
  deps: IngestDeps,
): Promise<void> {
  const cache = await loadIndex(CACHE_PATH);
  if (cache && cache.signature === signature) {
    store.restore(cache.entries);
    console.error(`⚡ Índice carregado do cache (${cache.entries.length} chunks). Sem reindexar.`);
    return;
  }
  await indexDocs(store, deps);
  await saveIndex(CACHE_PATH, { signature, entries: store.snapshot() });
  console.error('💾 Índice salvo em cache. As próximas execuções serão instantâneas.');
}

async function prepareMongo(
  store: MongoVectorStore,
  signature: string,
  deps: IngestDeps,
): Promise<void> {
  const saved = await store.readSignature();
  if (saved === signature && (await store.count()) > 0) {
    console.error(`⚡ Índice já está no MongoDB (${await store.count()} chunks). Sem reindexar.`);
    return;
  }
  await store.clear();
  await indexDocs(store, deps);
  await store.writeSignature(signature);
  console.error('💾 Índice gravado no MongoDB. As próximas execuções serão instantâneas.');
}
