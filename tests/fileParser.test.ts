// Testes do FileParser (o despachante). Provamos que ele escolhe o parser certo
// pela extensão e recusa o que não sabe ler.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FileParser } from '../src/adapters/fileParser.ts';

const MD = new URL('./fixtures/exemplo.md', import.meta.url).pathname;
const PDF = new URL('./fixtures/exemplo.pdf', import.meta.url).pathname;

test('lê .md delegando para o parser de texto', async () => {
  const parser = new FileParser();
  const doc = await parser.parse(MD);
  assert.equal(doc.source, 'exemplo.md');
  assert.ok(doc.text.length > 0);
});

test('lê .pdf delegando para o parser de PDF', async () => {
  const parser = new FileParser();
  const doc = await parser.parse(PDF);
  assert.equal(doc.source, 'exemplo.pdf');
  assert.match(doc.text, /Refatoracao/i);
});

test('recusa extensão desconhecida com erro claro', async () => {
  const parser = new FileParser();
  await assert.rejects(() => parser.parse('planilha.xlsx'), /cannot read/i);
});

test('suporta() reconhece os formatos certos', () => {
  assert.equal(FileParser.supports('a.pdf'), true);
  assert.equal(FileParser.supports('a.md'), true);
  assert.equal(FileParser.supports('a.png'), false);
});
