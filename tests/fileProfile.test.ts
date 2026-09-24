// Tests for FileProfile (Step 20): the study profile persisted to a JSON file.
// The key behavior is PERSISTENCE ACROSS SESSIONS — so we simulate a "new session"
// by creating a SECOND FileProfile instance pointing at the same file.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { FileProfile } from '../src/adapters/fileProfile.ts';

/** Makes a unique temp file path and a cleanup function. */
async function makeTempFile() {
  const dir = await mkdtemp(join(tmpdir(), 'profile-'));
  const path = join(dir, 'profile.json');
  return { path, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('persists records across instances (a new session still remembers)', async () => {
  const { path, cleanup } = await makeTempFile();
  try {
    const first = new FileProfile(path);
    await first.record('sess-1', 'what is coupling?', ['fowler.pdf']);
    await first.record('sess-1', 'how to reduce coupling?', ['fowler.pdf']);

    // Simulate a brand-new process/session reading the same file.
    const second = new FileProfile(path);
    const summary = await second.summary('sess-1');
    assert.equal(summary.total, 2);
    assert.equal(summary.bySource[0].source, 'fowler.pdf');
  } finally {
    await cleanup();
  }
});

test('difficulty detection survives across sessions', async () => {
  const { path, cleanup } = await makeTempFile();
  try {
    const s1 = new FileProfile(path);
    await s1.record('u', 'o que é acoplamento?', ['fowler.pdf']);
    await s1.record('u', 'como reduzir acoplamento?', ['fowler.pdf']);
    await s1.record('u', 'ainda não entendi acoplamento', ['fowler.pdf']);

    // New instance = new session: it should still see where the student struggled.
    const s2 = new FileProfile(path);
    const { difficulties } = await s2.summary('u');
    assert.ok(difficulties.length > 0, 'expected difficulty areas to persist');
    assert.ok(difficulties.some((d) => d.reason === 'revisited-source'));
    assert.ok(difficulties.some((d) => d.reason === 'confusion'));
  } finally {
    await cleanup();
  }
});

test('isolates records by student', async () => {
  const { path, cleanup } = await makeTempFile();
  try {
    const p = new FileProfile(path);
    await p.record('alice', 'q1', ['a.pdf']);
    await p.record('bob', 'q2', ['b.pdf']);

    assert.equal((await p.summary('alice')).total, 1);
    assert.equal((await p.summary('bob')).total, 1);
    // A student with no records gets an empty summary, not someone else's.
    assert.equal((await p.summary('carol')).total, 0);
  } finally {
    await cleanup();
  }
});

test('missing file → empty summary (does not throw)', async () => {
  const { path, cleanup } = await makeTempFile(); // path exists as a dir, file not created yet
  try {
    const p = new FileProfile(path);
    const summary = await p.summary('nobody');
    assert.deepEqual(summary, { total: 0, bySource: [], recent: [], difficulties: [] });
  } finally {
    await cleanup();
  }
});

test('corrupted file → starts fresh (does not throw)', async () => {
  const { path, cleanup } = await makeTempFile();
  try {
    // Write garbage, then make sure the adapter recovers instead of crashing.
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, 'not json {{{', 'utf-8');

    const p = new FileProfile(path);
    assert.equal((await p.summary('x')).total, 0);
    // And it can still record from there.
    await p.record('x', 'q', ['a.pdf']);
    assert.equal((await p.summary('x')).total, 1);
  } finally {
    await cleanup();
  }
});
