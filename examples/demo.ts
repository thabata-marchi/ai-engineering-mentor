// ============================================================================
//  DEMO — the RAG (the RETRIEVAL part) working end to end
// ============================================================================
//
//  What this script does, in RAG order:
//    1. INGESTION: reads the .md files in examples/docs, splits into chunks,
//                  generates embeddings and stores them in the vector store.
//    2. SEARCH:    for each question, embeds the question and retrieves the most
//                  similar chunks — showing the score and the source.
//
//  There is NO real LLM here (that's Step 4). This demo proves that "retrieval" —
//  the R of RAG — works: given a question, we find the right snippet.
//
//  WHY FakeEmbedder in the demo?
//  So you can run it NOW, without downloading a model or using the internet. To use
//  the real embedder, run `npm install` and swap the line marked [SWAP] for
//  `new LocalEmbedder()`.
//
//  How to run:
//    node --experimental-strip-types examples/demo.ts
// ============================================================================

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { TextFileParser } from '../src/adapters/textFileParser.ts';
import { SlidingWindowChunker } from '../src/core/chunker.ts';
import { InMemoryVectorStore } from '../src/adapters/inMemoryVectorStore.ts';
import { AnswerQuestion } from '../src/application/answerQuestion.ts';
import type { LLMPort } from '../src/core/ports.ts';
import { FakeEmbedder } from '../tests/helpers/fakeEmbedder.ts';
// import { LocalEmbedder } from '../src/adapters/localEmbedder.ts'; // real embedder

const DOCS_DIR = new URL('./docs/', import.meta.url).pathname;

// A fake LLM just for the demo: instead of generating text, it RETURNS the prompt
// it received — so you SEE the context that would be sent to a real LLM. In Step 4b
// we swap this for a real adapter (e.g. OpenRouter).
class EchoLLM implements LLMPort {
  async generate(_systemPrompt: string, userPrompt: string): Promise<string> {
    return `(simulated answer — a real LLM would answer using this context)\n${userPrompt}`;
  }
}

async function main() {
  // We assemble the pieces (each honors a port → we could swap any one without
  // touching the rest).
  const parser = new TextFileParser();
  const chunker = new SlidingWindowChunker({ chunkSizeWords: 60, overlapWords: 10 });
  const embedder = new FakeEmbedder(); // [SWAP] -> new LocalEmbedder()
  const store = new InMemoryVectorStore();

  // ---------- 1. INGESTION ----------
  const files = (await readdir(DOCS_DIR)).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const doc = await parser.parse(join(DOCS_DIR, file));
    const chunks = chunker.chunk(doc);
    const embeddings = await embedder.embed(chunks.map((c) => c.text));
    await store.add(chunks, embeddings);
    console.log(`📄 indexed: ${file}  (${chunks.length} chunk(s))`);
  }

  // ---------- 2. QUESTION → ANSWER WITH SOURCES (the full use case) ----------
  const useCase = new AnswerQuestion({ embedder, store, llm: new EchoLLM(), topK: 2 });

  const questions = [
    'how to isolate database access?',
    'why split a class into responsibilities?',
    'what is the overlap between pieces for?',
  ];

  for (const question of questions) {
    const answer = await useCase.execute(question);

    console.log(`\n❓ ${question}`);
    // Here the text is simulated (EchoLLM). What matters are the traceable SOURCES:
    console.log('   Cited sources:');
    answer.sources.forEach((s, i) => {
      console.log(`     [${i + 1}] ${s.source} (chunk #${s.position})`);
    });
  }
}

main();
