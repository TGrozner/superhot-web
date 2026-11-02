import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotSoundParams } from '../src/sound/params.js';
import { createSoundTimeline, SOUND_CLOCKS } from '../src/sound/timeline.js';

test('enqueued nested data is detached from the callers mutable objects', () => {
  const received = [];
  const t = createSoundTimeline({ dispatch: (event) => { received.push(event); } });
  const params = { gain: 0.5, spatial: { position: [1, 2, 3] } };
  t.enqueue({ name: 'web-synth', clock: SOUND_CLOCKS.REAL, params });
  params.spatial.position[0] = 99;
  params.gain = 1;
  assert.equal(t.flushDue(), 1);
  assert.deepEqual(received[0].params, { gain: 0.5, spatial: { position: [1, 2, 3] } });
  assert.ok(Object.isFrozen(received[0].params.spatial.position));
  assert.equal(t.stats().accepted, 1);
});

test('cycles, nonfinite data and accessor input are rejected atomically', () => {
  const t = createSoundTimeline({ dispatch: () => {} });
  const cyclic = {}; cyclic.self = cyclic;
  const getter = Object.defineProperty({}, 'x', { enumerable: true, get() { throw Error('should not call getter'); } });
  for (const params of [{ item: cyclic }, { item: getter }, { gain: Infinity }, { data: undefined }]) {
    assert.throws(() => t.enqueue({ name: 'bad', clock: SOUND_CLOCKS.WORLD, params }));
  }
  assert.equal(t.stats().enqueued, 0);
  assert.equal(t.enqueue({ name: 'good', clock: SOUND_CLOCKS.WORLD }), 1);
});

test('bounded snapshot rejects excessive nesting or arrays', () => {
  let nested = {};
  for (let i = 0; i < 13; i++) nested = { child: nested };
  assert.throws(() => snapshotSoundParams(nested), /nesting limit/);
  assert.throws(() => snapshotSoundParams({ values: Array(513).fill(0) }), /max 512/);
});
