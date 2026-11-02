import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrototypeSoundSink, PROTOTYPE_SOUND_NAMES } from '../src/sound/prototype-sink.js';
import { createSoundTimeline, SOUND_CLOCKS, SOUND_EVIDENCE } from '../src/sound/timeline.js';

test('compatibility names come solely from current synthetic src/audio.js', () => {
  assert.deepEqual(PROTOTYPE_SOUND_NAMES, ['shoot', 'enemyShoot', 'shatter', 'pickup', 'hit', 'empty', 'win']);
  assert.throws(() => createPrototypeSoundSink(null), /audio/);
});

test('supported synthesized event calls the injected method but does not infer audibility', () => {
  const methods = [];
  const audio = { shoot() { methods.push(this === audio ? 'shoot' : 'wrong-this'); } };
  const timeline = createSoundTimeline({ dispatch: createPrototypeSoundSink(audio) });
  timeline.enqueue({ name: 'shoot', clock: SOUND_CLOCKS.REAL, evidence: SOUND_EVIDENCE.PROTOTYPE });
  timeline.enqueue({ name: 'native-name-not-mapped', clock: SOUND_CLOCKS.REAL });
  timeline.enqueue({ name: 'enemyShoot', clock: SOUND_CLOCKS.REAL }); // no method on this adapter
  assert.equal(timeline.flushDue(), 3);
  assert.deepEqual(methods, ['shoot']);
  assert.equal(timeline.stats().accepted, 1); // callback accepted, not sound heard
  assert.equal(timeline.stats().rejected, 2);
});
