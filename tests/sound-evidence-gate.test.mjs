import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrototypeSoundSink } from '../src/sound/prototype-sink.js';
import { createSoundTimeline, SOUND_CLOCKS, SOUND_EVIDENCE } from '../src/sound/timeline.js';

test('same-named native and unverified events never trigger synthetic audio', () => {
  const called = [];
  const sink = createPrototypeSoundSink({ shoot() { called.push('shoot'); } });
  for (const evidence of [
    undefined, SOUND_EVIDENCE.UNVERIFIED,
    SOUND_EVIDENCE.NATIVE_OBSERVED, SOUND_EVIDENCE.NATIVE_PROVEN,
  ]) {
    assert.equal(sink({ name: 'shoot', evidence }), false);
  }
  assert.deepEqual(called, []);
});

test('only an explicitly labeled prototype event invokes a supported synth', () => {
  const called = [];
  const audio = { shoot() { assert.equal(this, audio); called.push('shoot'); } };
  const sink = createPrototypeSoundSink(audio);
  assert.equal(sink({ name: 'shoot', evidence: SOUND_EVIDENCE.PROTOTYPE }), true);
  assert.equal(sink({ name: 'unmapped', evidence: SOUND_EVIDENCE.PROTOTYPE }), false);
  assert.equal(sink({ name: 'enemyShoot', evidence: SOUND_EVIDENCE.PROTOTYPE }), false);
  assert.deepEqual(called, ['shoot']);
});

test('unclassified standalone events cannot bypass the provenance gate', () => {
  const sink = createPrototypeSoundSink({ shoot() { throw new Error('must not run'); } });
  assert.equal(sink(), false);
  assert.equal(sink(null), false);
  assert.equal(sink({ name: 'shoot' }), false);
  assert.equal(sink({ name: 'shoot', evidence: 'native' }), false);
});

test('timeline counts rejected native and unverified names separately from synth acceptance', () => {
  const calls = [];
  const timeline = createSoundTimeline({
    dispatch: createPrototypeSoundSink({ shoot() { calls.push('shoot'); } }),
  });
  for (const evidence of [
    SOUND_EVIDENCE.UNVERIFIED, SOUND_EVIDENCE.NATIVE_PROVEN, SOUND_EVIDENCE.PROTOTYPE,
  ]) {
    timeline.enqueue({ name: 'shoot', clock: SOUND_CLOCKS.REAL, evidence });
  }
  assert.equal(timeline.flushDue(), 3);
  assert.deepEqual(calls, ['shoot']);
  assert.equal(timeline.stats().accepted, 1);
  assert.equal(timeline.stats().rejected, 2);
  // "accepted" means a method was invoked, never that any sound was heard.
});
