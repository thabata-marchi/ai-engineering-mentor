// ============================================================================
//  setup.ts — shared "composition root" (used by ask.ts, chat.ts, mcp.ts, ...)
// ============================================================================
//
//  Here we pick the REAL implementations based on the environment (.env), index
//  the base once and return everything ready. This way every mode of use (a
//  single question = ask.ts; a conversation = chat.ts; the MCP server = mcp.ts)
//  reuses the SAME composition, without duplicating code.
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
import { FileProfile } from '../src/adapters/fileProfile.ts';
import { MongoProfile } from '../src/adapters/mongoProfile.ts';
import { LocalEmbedder, type EmbedderDtype } from '../src/adapters/localEmbedder.ts';
import { createLLMFromEnv } from '../src/adapters/llmFactory.ts';
import { RateLimitedLLM } from '../src/adapters/rateLimitedLLM.ts';
import { RateLimiter } from '../src/core/rateLimiter.ts';
import { loadIndex, saveIndex } from '../src/adapters/indexCache.ts';
import type { LLMPort, MemoryPort, ProfilePort, VectorStorePort } from '../src/core/ports.ts';
import type { MentorMode, MentorLang } from '../src/application/answerQuestion.ts';

const CACHE_PATH = resolve(process.cwd(), 'data/vectorstore/index.json');
// Where the persistent study profile lives (Step 20). Same `data/` folder as the
// index cache (Git-ignored). Override with PROFILE_PATH.
const PROFILE_PATH = process.env.PROFILE_PATH
  ? resolve(process.cwd(), process.env.PROFILE_PATH)
  : resolve(process.cwd(), 'data/profile.json');
const CHUNK_CONFIG = { chunkSizeWords: 200, overlapWords: 30 };
const BATCH_SIZE = 32;
const MAX_CHUNKS = process.env.MAX_CHUNKS ? Number(process.env.MAX_CHUNKS) : Infinity;

// Base folder. Default: examples/docs. Point to your own folder with DOCS_DIR.
const DEFAULT_DIR = new URL('./docs/', import.meta.url).pathname;
const DOCS_DIR = process.env.DOCS_DIR
  ? isAbsolute(process.env.DOCS_DIR)
    ? process.env.DOCS_DIR
    : resolve(process.cwd(), process.env.DOCS_DIR)
  : DEFAULT_DIR;

/** Everything the mentor needs, already assembled and indexed. */
export interface Mentor {
  readonly embedder: LocalEmbedder;
  readonly store: VectorStorePort;
  readonly memory: MemoryPort;
  readonly profile: ProfilePort;
  readonly llm: LLMPort;
  readonly limiter: RateLimiter; // shared (RAG + agent) to protect the quota
  readonly topK: number;
  readonly mode: MentorMode;
  readonly lang: MentorLang; // answer language (Step 18)
  readonly usingMongo: boolean;
  cleanup(): Promise<void>;
}

export async function setupMentor(): Promise<Mentor> {
  const parser = new FileParser();
  const chunker = new SlidingWindowChunker(CHUNK_CONFIG);
  const dtype = (process.env.EMBEDDER_DTYPE as EmbedderDtype) || 'q8';
  const embedder = new LocalEmbedder(dtype);
  const timeoutMs = process.env.LLM_TIMEOUT_MS ? Number(process.env.LLM_TIMEOUT_MS) : 120_000;
  // SHARED rate limit: protects the provider quota (RAG + agent share the same
  // cap). Generous default (20/min) — tune with RATE_LIMIT_MAX/WINDOW.
  const limiter = new RateLimiter({
    max: process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : 20,
    windowMs: process.env.RATE_LIMIT_WINDOW_MS ? Number(process.env.RATE_LIMIT_WINDOW_MS) : 60_000,
  });
  // Multi-provider (Step 16): LLM_PROVIDER picks openrouter|openai|anthropic|gemini.
  // The factory resolves the key/model from env and validates (built-in secret guard).
  const { llm: rawLlm, provider, model } = createLLMFromEnv(timeoutMs);
  const llm = new RateLimitedLLM(rawLlm, limiter);
  console.error(`🤖 Provider: ${provider} | Model: ${model}`);

  const files = (await readdir(DOCS_DIR)).filter((f) => FileParser.supports(f));
  if (files.length === 0) {
    throw new Error(`No supported files (.pdf/.md/.txt) in: ${DOCS_DIR}`);
  }
  const signature = await buildSignature(files, dtype);

  // Store and memory: in-memory (default) OR MongoDB (VECTOR_STORE=mongo).
  const usingMongo = process.env.VECTOR_STORE === 'mongo';
  const mongoUrl = process.env.MONGO_URL ?? 'mongodb://localhost:27017';
  const store: VectorStorePort = usingMongo
    ? new MongoVectorStore({ url: mongoUrl })
    : new InMemoryVectorStore();
  const memory: MemoryPort = usingMongo
    ? new MongoMemory({ url: mongoUrl })
    : new InMemoryMemory();
  // Profile persistence (Step 20): Mongo when enabled; otherwise a JSON file on disk
  // by DEFAULT, so the mentor remembers where you got stuck ACROSS SESSIONS with no
  // Docker. Set PROFILE_STORE=memory for a throwaway, in-RAM profile.
  const profile: ProfilePort = usingMongo
    ? new MongoProfile({ url: mongoUrl })
    : process.env.PROFILE_STORE === 'memory'
      ? new InMemoryProfile()
      : new FileProfile(PROFILE_PATH);

  const deps: IngestDeps = { parser, chunker, embedder, files };
  if (usingMongo) {
    await prepareMongo(store as MongoVectorStore, signature, deps);
  } else {
    await prepareMemory(store as InMemoryVectorStore, signature, deps);
  }

  const topK = process.env.TOP_K ? Number(process.env.TOP_K) : 5;
  // MODE: 'guided' (default) or 'direct'. Accepts the old PT values as aliases.
  const rawMode = process.env.MODE;
  const mode: MentorMode = rawMode === 'direct' || rawMode === 'direto' ? 'direct' : 'guided';
  // MENTOR_LANG: 'en' (default) or 'pt' — the language the mentor answers in (Step 18).
  const lang: MentorLang = process.env.MENTOR_LANG === 'pt' ? 'pt' : 'en';

  return {
    embedder,
    store,
    memory,
    profile,
    llm,
    limiter,
    topK,
    mode,
    lang,
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
  console.error(`⏳ Indexing ${deps.files.length} file(s) from ${DOCS_DIR}`);
  console.error('   (the first time downloads the embedding model; after that it is faster)');
  for (const file of deps.files) {
    const doc = await deps.parser.parse(join(DOCS_DIR, file));
    let chunks = deps.chunker.chunk(doc);
    if (chunks.length > MAX_CHUNKS) {
      chunks = chunks.slice(0, MAX_CHUNKS);
      console.error(`   ${file}: limited to ${MAX_CHUNKS} chunks (MAX_CHUNKS)`);
    }
    console.error(`   ${file}: ${chunks.length} chunks — generating embeddings...`);
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await deps.embedder.embed(batch.map((c) => c.text));
      await store.add(batch, embeddings);
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
    console.error(`⚡ Index loaded from cache (${cache.entries.length} chunks). No re-indexing.`);
    return;
  }
  await indexDocs(store, deps);
  await saveIndex(CACHE_PATH, { signature, entries: store.snapshot() });
  console.error('💾 Index saved to cache. The next runs will be instant.');
}

async function prepareMongo(
  store: MongoVectorStore,
  signature: string,
  deps: IngestDeps,
): Promise<void> {
  const saved = await store.readSignature();
  if (saved === signature && (await store.count()) > 0) {
    console.error(`⚡ Index already in MongoDB (${await store.count()} chunks). No re-indexing.`);
    return;
  }
  await store.clear();
  await indexDocs(store, deps);
  await store.writeSignature(signature);
  console.error('💾 Index written to MongoDB. The next runs will be instant.');
}
