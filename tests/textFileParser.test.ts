// Testes do TextFileParser. Como ele LÊ um arquivo de verdade, usamos um
// arquivo de "fixture" (tests/fixtures/exemplo.md). Isso está entre teste
// unitário e de integração — mas é rápido e não usa rede.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { TextFileParser } from '../src/adapters/textFileParser.ts';

// Caminho absoluto até a fixture, relativo a ESTE arquivo (funciona de qualquer cwd).
const fixture = fileURLToPath(new URL('./fixtures/exemplo.md', import.meta.url));

test('lê um .md e devolve Document com texto, id e fonte', async () => {
  const parser = new TextFileParser();
  const document = await parser.parse(fixture);

  assert.equal(document.source, 'exemplo.md'); // nome do arquivo → citar a fonte
  assert.equal(document.id, 'exemplo'); // nome sem extensão
  assert.ok(document.text.includes('Single Responsibility Principle')); // conteúdo lido
});

test('recusa tipos não suportados (ex.: .pdf) com erro claro', async () => {
  const parser = new TextFileParser();
  await assert.rejects(() => parser.parse('algum/arquivo.pdf'), /PdfParser/);
});
