// Tests for analyzeDifficulty — pure heuristic, deterministic output (no I/O, no LLM).
// We build small StudyRecord lists and assert which difficulty areas surface.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyzeDifficulty, describeDifficulty } from '../src/core/difficulty.ts';
import type { StudyRecord } from '../src/core/models.ts';

// Tiny helper to build a record without repeating the timestamp everywhere.
function rec(question: string, sources: string[] = []): StudyRecord {
  return { question, sources, at: '2026-09-22T00:00:00.000Z' };
}

test('empty history → no difficulty areas', () => {
  const report = analyzeDifficulty([]);
  assert.deepEqual(report.areas, []);
});

test('a source consulted 3+ times is flagged as revisited', () => {
  const records = [
    rec('extract function?', ['fowler.pdf']),
    rec('inline function?', ['fowler.pdf']),
    rec('move method?', ['fowler.pdf']),
  ];
  const report = analyzeDifficulty(records);
  const revisited = report.areas.find((a) => a.reason === 'revisited-source');
  assert.ok(revisited, 'expected a revisited-source area');
  assert.equal(revisited.topic, 'fowler.pdf');
  assert.equal(revisited.occurrences, 3);
});

test('a source consulted only twice is NOT flagged (below default threshold)', () => {
  const records = [rec('q1', ['a.pdf']), rec('q2', ['a.pdf'])];
  const report = analyzeDifficulty(records);
  assert.equal(
    report.areas.some((a) => a.reason === 'revisited-source'),
    false,
  );
});

test('a keyword recurring across questions is flagged as a recurring topic', () => {
  const records = [
    rec('what is a code smell?'),
    rec('give me an example of a smell'),
    rec('how do I remove a smell?'),
  ];
  const report = analyzeDifficulty(records);
  const topic = report.areas.find((a) => a.reason === 'recurring-topic');
  assert.ok(topic, 'expected a recurring-topic area');
  // "smell"/"smells" collapse via the plural trim → keyword "smell".
  assert.equal(topic.topic, 'smell');
  assert.ok(topic.occurrences >= 3);
});

test('re-asking a very similar question is flagged as repeated', () => {
  const records = [
    rec('what is the extract function refactoring?'),
    rec('what is the extract function refactoring'), // basically the same
  ];
  const report = analyzeDifficulty(records);
  const repeated = report.areas.find((a) => a.reason === 'repeated-question');
  assert.ok(repeated, 'expected a repeated-question area');
  assert.equal(repeated.occurrences, 2);
});

test('two unrelated questions are NOT clustered as repeated', () => {
  const records = [rec('what is polymorphism?'), rec('explain database indexing')];
  const report = analyzeDifficulty(records);
  assert.equal(
    report.areas.some((a) => a.reason === 'repeated-question'),
    false,
  );
});

test('explicit confusion markers are detected (PT and EN)', () => {
  const pt = analyzeDifficulty([rec('não entendi o que é acoplamento')]);
  assert.ok(pt.areas.some((a) => a.reason === 'confusion'), 'expected PT confusion');

  const en = analyzeDifficulty([rec("I don't understand dependency inversion")]);
  assert.ok(en.areas.some((a) => a.reason === 'confusion'), 'expected EN confusion');
});

test('areas are sorted strongest-first and capped by maxAreas', () => {
  const records = [
    rec('coupling coupling coupling', ['a.pdf']),
    rec('coupling again please', ['a.pdf']),
    rec('coupling once more', ['a.pdf']),
    rec('cohesion topic here', ['b.pdf']),
  ];
  const report = analyzeDifficulty(records, { maxAreas: 2 });
  assert.equal(report.areas.length, 2);
  // The most frequent signal must come first.
  assert.ok(report.areas[0].occurrences >= report.areas[1].occurrences);
});

test('describeDifficulty renders a readable line per reason', () => {
  assert.match(
    describeDifficulty({ topic: 'fowler.pdf', reason: 'revisited-source', occurrences: 4 }),
    /keep going back to "fowler\.pdf"/,
  );
  assert.match(
    describeDifficulty({ topic: 'coupling', reason: 'recurring-topic', occurrences: 3 }),
    /"coupling" comes up a lot/,
  );
  assert.match(
    describeDifficulty({ topic: 'not clear on DIP', reason: 'confusion', occurrences: 1 }),
    /flagged confusion/,
  );
});

test('thresholds are configurable', () => {
  const records = [rec('q', ['a.pdf']), rec('q2', ['a.pdf'])];
  // Lower the bar: now 2 revisits is enough.
  const report = analyzeDifficulty(records, { minSourceRevisits: 2 });
  assert.ok(report.areas.some((a) => a.reason === 'revisited-source'));
});
