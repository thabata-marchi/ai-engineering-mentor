// Testes da validação de entrada (Etapa 12).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  validateQuestion,
  ValidationError,
  MAX_QUESTION_LEN,
  parseMinScore,
} from '../src/core/validation.ts';

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

// Etapa 21 — MIN_SCORE vem do ambiente: vazio desliga; valor inválido falha alto.
test('parseMinScore: vazio/ausente → undefined (limiar desligado)', () => {
  assert.equal(parseMinScore(undefined), undefined);
  assert.equal(parseMinScore(''), undefined);
  assert.equal(parseMinScore('   '), undefined);
});

test('parseMinScore: número em [0,1] é aceito', () => {
  assert.equal(parseMinScore('0'), 0);
  assert.equal(parseMinScore('0.35'), 0.35);
  assert.equal(parseMinScore('1'), 1);
});

test('parseMinScore: fora do intervalo ou não-numérico → erro', () => {
  assert.throws(() => parseMinScore('1.2'), /MIN_SCORE/);
  assert.throws(() => parseMinScore('-0.1'), /MIN_SCORE/);
  assert.throws(() => parseMinScore('abc'), /MIN_SCORE/);
});
