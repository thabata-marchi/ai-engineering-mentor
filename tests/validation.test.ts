// Testes da validação de entrada (Etapa 12).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateQuestion, ValidationError, MAX_QUESTION_LEN } from '../src/core/validation.ts';

test('apara espaços e devolve o texto normalizado', () => {
  assert.equal(validateQuestion('  o que é SRP?  '), 'o que é SRP?');
});

test('recusa pergunta vazia (ou só espaços)', () => {
  assert.throws(() => validateQuestion(''), ValidationError);
  assert.throws(() => validateQuestion('    '), ValidationError);
});

test('recusa pergunta acima do teto', () => {
  const gigante = 'a'.repeat(MAX_QUESTION_LEN + 1);
  assert.throws(() => validateQuestion(gigante), /too long/);
});

test('aceita no limite exato', () => {
  const noLimite = 'a'.repeat(MAX_QUESTION_LEN);
  assert.equal(validateQuestion(noLimite).length, MAX_QUESTION_LEN);
});
