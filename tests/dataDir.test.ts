// Testes da resolução da pasta de dados (Etapa 22). Função pura: passamos cwd e
// home à mão, então cobrimos todos os caminhos sem tocar no disco.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveDataDir } from '../src/core/dataDir.ts';

const home = '/Users/aluna';

test('sem DATA_DIR, num projeto: usa <cwd>/data (comportamento de antes)', () => {
  assert.equal(resolveDataDir({ cwd: '/proj/mentor', home }), '/proj/mentor/data');
});

test('cwd = "/" (cliente MCP como o Claude Desktop): cai para ~/.ai-engineering-mentor', () => {
  assert.equal(resolveDataDir({ cwd: '/', home }), '/Users/aluna/.ai-engineering-mentor');
});

test('DATA_DIR absoluto tem prioridade, mesmo com cwd = "/"', () => {
  assert.equal(resolveDataDir({ dataDir: '/tmp/mentor', cwd: '/', home }), '/tmp/mentor');
});

test('DATA_DIR relativo é resolvido a partir do cwd', () => {
  assert.equal(resolveDataDir({ dataDir: 'estado', cwd: '/proj/mentor', home }), '/proj/mentor/estado');
});
