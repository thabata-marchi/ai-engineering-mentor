// Testes do SlidingWindowChunker — lógica PURA, então fácil e rápido de testar.
// Aqui usamos textos "sintéticos" (w0, w1, w2...) para conferir o comportamento
// da janela deslizante de forma DETERMINÍSTICA (o resultado é sempre o mesmo).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SlidingWindowChunker } from '../src/core/chunker.ts';
import type { Document } from '../src/core/models.ts';

/** Helper: cria um Document com o texto dado. */
function doc(text: string): Document {
  return { id: 'd1', source: 'd1.md', text };
}

/** Helper: gera "w0 w1 w2 ... w(n-1)" — palavras numeradas, fáceis de conferir. */
function palavras(n: number): string {
  return Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
}

test('texto curto (menor que o chunk) vira 1 chunk só', () => {
  const chunker = new SlidingWindowChunker({ chunkSizeWords: 20, overlapWords: 5 });
  const chunks = chunker.chunk(doc('apenas algumas palavras aqui'));

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].position, 0);
  assert.equal(chunks[0].id, 'd1-0');
  assert.equal(chunks[0].text, 'apenas algumas palavras aqui');
});

test('texto longo é dividido com sobreposição (overlap) correta', () => {
  // 50 palavras, janela de 20, overlap de 5 → passo (step) de 15.
  const chunker = new SlidingWindowChunker({ chunkSizeWords: 20, overlapWords: 5 });
  const chunks = chunker.chunk(doc(palavras(50)));

  // start 0, 15, 30 → 3 chunks
  assert.equal(chunks.length, 3);
  assert.deepEqual(
    chunks.map((c) => c.position),
    [0, 1, 2],
  );

  // Overlap: as últimas 5 palavras do chunk 0 = as primeiras 5 do chunk 1.
  const fim0 = chunks[0].text.split(' ').slice(-5);
  const inicio1 = chunks[1].text.split(' ').slice(0, 5);
  assert.deepEqual(fim0, inicio1); // continuidade preservada
  assert.deepEqual(inicio1, ['w15', 'w16', 'w17', 'w18', 'w19']);

  // O último chunk deve conter a última palavra do documento.
  assert.ok(chunks[2].text.includes('w49'));
});

test('documento vazio não gera chunk nenhum', () => {
  const chunker = new SlidingWindowChunker();
  assert.deepEqual(chunker.chunk(doc('   ')), []);
});

test('configuração inválida (overlap >= tamanho) falha cedo', () => {
  assert.throws(
    () => new SlidingWindowChunker({ chunkSizeWords: 10, overlapWords: 10 }),
    /overlapWords/,
  );
});
