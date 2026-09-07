// ============================================================================
//  TESTES DO NÚCLEO — validam as "peças de dado" (models)
// ============================================================================
//
//  O QUE É UM TESTE UNITÁRIO?
//  É um teste pequeno e rápido que verifica UMA coisa isolada — sem rede, sem
//  LLM, sem banco. Roda em milissegundos, então dá pra rodar a cada mudança.
//
//  FERRAMENTAS (nativas do Node — as mesmas do curso, sem instalar nada):
//    • `node:test`          → o "test runner": descobre e executa os testes.
//    • `node:assert/strict` → as "afirmações": se algo não bate, o teste falha.
//
//  PADRÃO AAA (boa prática de organização de um teste):
//    1. Arrange (preparar):  criar os dados de entrada.
//    2. Act     (agir):      executar o que se quer testar.
//    3. Assert  (verificar): conferir se o resultado é o esperado.
//  Aqui os testes são simples (só validam a forma dos dados), então o "Act" e o
//  "Assert" quase se fundem — mas a ideia do padrão é essa.
//
//  NOTA Python → TS:
//  Em Python o `frozen=True` era verificado em TEMPO DE EXECUÇÃO. Em TS, o
//  `readonly` é verificado em TEMPO DE COMPILAÇÃO (o compilador te impede de
//  reatribuir). Por isso NÃO há um teste de "imutabilidade em runtime" aqui —
//  quem garante isso é o TypeScript, não o teste.
// ============================================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';

// `import type` = importamos SÓ os tipos (somem na hora de rodar). A extensão
// `.ts` no caminho é exigida pelo Node ao rodar TypeScript nativamente.
import type { Answer, Chunk, Document } from '../src/core/models.ts';

// Cada `test('nome', () => { ... })` é um caso de teste independente.
test('Document guarda texto e fonte', () => {
  // Arrange: monto um Document de exemplo.
  const doc: Document = {
    id: 'd1',
    source: 'clean_code.pdf',
    text: 'conteúdo do livro',
  };
  // Assert: confiro que os campos foram guardados como esperado.
  assert.equal(doc.text, 'conteúdo do livro');
  assert.equal(doc.source, 'clean_code.pdf'); // a fonte é preservada → rastreabilidade
});

test('Chunk referencia o documento de origem', () => {
  // Um Chunk precisa saber de QUAL documento veio (documentId) e a sua ordem.
  const chunk: Chunk = {
    id: 'd1-0',
    documentId: 'd1',
    text: 'trecho',
    position: 0,
  };
  assert.equal(chunk.documentId, 'd1');
  assert.equal(chunk.position, 0);
});

test('Answer carrega as fontes', () => {
  // A resposta final deve trazer as fontes → é o que dá confiança e rastreabilidade.
  const ans: Answer = {
    text: 'A classe viola o SRP.',
    sources: [{ documentId: 'd1', source: 'clean_code.pdf', position: 3 }],
  };
  assert.equal(ans.sources[0].source, 'clean_code.pdf');
});
