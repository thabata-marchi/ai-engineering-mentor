// ============================================================================
//  DEMO — o RAG (a parte de RETRIEVAL) funcionando de ponta a ponta
// ============================================================================
//
//  O que este script faz, na ordem do RAG:
//    1. INGESTÃO:  lê os .md de examples/docs, quebra em chunks, gera embeddings
//                  e guarda no vector store.
//    2. BUSCA:     para cada pergunta, gera o embedding da pergunta e recupera
//                  os chunks mais parecidos — mostrando o score e a fonte.
//
//  Ainda NÃO há LLM aqui (isso é a Etapa 4). Este demo prova que a "recuperação"
//  — o R do RAG — está funcionando: dada uma pergunta, achamos o trecho certo.
//
//  POR QUE FakeEmbedder no demo?
//  Para você conseguir rodar AGORA, sem baixar modelo nem internet. Para usar o
//  embedder de verdade, faça `npm install` e troque a linha marcada com [TROCA]
//  por `new LocalEmbedder()`.
//
//  Como rodar:
//    node --experimental-strip-types examples/demo.ts
// ============================================================================

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { TextFileParser } from '../src/adapters/textFileParser.ts';
import { SlidingWindowChunker } from '../src/core/chunker.ts';
import { InMemoryVectorStore } from '../src/adapters/inMemoryVectorStore.ts';
import { FakeEmbedder } from '../tests/helpers/fakeEmbedder.ts';
// import { LocalEmbedder } from '../src/adapters/localEmbedder.ts'; // embedder real

const DOCS_DIR = new URL('./docs/', import.meta.url).pathname;

async function main() {
  // Montamos as peças (cada uma respeita um port → poderíamos trocar qualquer
  // uma sem mexer no resto).
  const parser = new TextFileParser();
  const chunker = new SlidingWindowChunker({ chunkSizeWords: 60, overlapWords: 10 });
  const embedder = new FakeEmbedder(); // [TROCA] -> new LocalEmbedder()
  const store = new InMemoryVectorStore();

  // ---------- 1. INGESTÃO ----------
  const files = (await readdir(DOCS_DIR)).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const doc = await parser.parse(join(DOCS_DIR, file));
    const chunks = chunker.chunk(doc);
    const embeddings = await embedder.embed(chunks.map((c) => c.text));
    await store.add(chunks, embeddings);
    console.log(`📄 indexado: ${file}  (${chunks.length} chunk(s))`);
  }

  // ---------- 2. BUSCA ----------
  const perguntas = [
    'como isolar o acesso ao banco de dados?',
    'por que dividir responsabilidades de uma classe?',
    'para que serve a sobreposição entre pedaços?',
  ];

  for (const pergunta of perguntas) {
    const [queryVector] = await embedder.embed([pergunta]);
    const { chunks } = await store.search(queryVector, 2);

    console.log(`\n❓ ${pergunta}`);
    chunks.forEach((sc, i) => {
      const preview = sc.chunk.text.replace(/\s+/g, ' ').slice(0, 70);
      console.log(
        `   ${i + 1}. [score ${sc.score.toFixed(3)}] (${sc.chunk.documentId}) ${preview}...`,
      );
    });
  }
}

main();
