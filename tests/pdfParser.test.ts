// Testes do PdfParser usando um PDF de fixture (tests/fixtures/exemplo.pdf,
// 2 páginas, conteúdo nosso). Provamos que ele extrai o texto e preenche os
// metadados — sem depender do PDF real (grande e protegido por direitos autorais).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PdfParser } from '../src/adapters/pdfParser.ts';

const FIXTURE = new URL('./fixtures/exemplo.pdf', import.meta.url).pathname;

test('extrai texto de um PDF e devolve Document com id/fonte', async () => {
  const parser = new PdfParser();
  const doc = await parser.parse(FIXTURE);

  assert.equal(doc.id, 'exemplo');
  assert.equal(doc.source, 'exemplo.pdf');
  assert.match(doc.text, /Refatoracao melhora o design/i); // texto da 1ª página
  assert.match(doc.text, /extrair metodo/i); // texto da 2ª página
  assert.equal(doc.metadata?.totalPages, 2);
});

test('recusa arquivo que não é .pdf, com erro claro', async () => {
  const parser = new PdfParser();
  await assert.rejects(() => parser.parse('algum.md'), /only reads \.pdf/i);
});
