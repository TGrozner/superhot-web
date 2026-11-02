import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundTimeline, SOUND_CLOCKS, SOUND_EVIDENCE } from '../src/sound/timeline.js';

const make = () => {
  const calls = [];
  const timeline = createSoundTimeline({ dispatch: (event) => { calls.push(event); return true; } });
  return { calls, timeline };
};

test('real and world clocks advance independently; no premature dispatch', () => {
  const { calls, timeline } = make();
  timeline.enqueue({ name: 'real-event', clock: SOUND_CLOCKS.REAL, delaySeconds: 0.2 });
  timeline.enqueue({ name: 'world-event', clock: SOUND_CLOCKS.WORLD, delaySeconds: 0.2 });
  assert.equal(timeline.advance({ realSeconds: 0.2, worldSeconds: 0.02 }), 1);
  assert.deepEqual(calls.map((e) => e.name), ['real-event']);
  assert.deepEqual(timeline.now(), { real: 0.2, world: 0.02 });
  assert.equal(timeline.advance({ realSeconds: 0, worldSeconds: 0.18 }), 1);
  assert.deepEqual(calls.map((e) => e.name), ['real-event', 'world-event']);
});

test('paused advances neither clock nor events; zero-delay can be flushed explicitly', () => {
  const { calls, timeline } = make();
  timeline.enqueue({ name: 'ready', clock: SOUND_CLOCKS.REAL, delaySeconds: 0 });
  assert.equal(timeline.advance({ realSeconds: 100, worldSeconds: 10, paused: true }), 0);
  assert.deepEqual(timeline.now(), { real: 0, world: 0 });
  assert.equal(timeline.flushDue(), 1);
  assert.equal(timeline.flushDue(), 0);
  assert.equal(calls.length, 1);
});

test('simultaneous events use enqueue order across clock domains', () => {
  const { calls, timeline } = make();
  timeline.enqueue({ name: 'world-first', clock: SOUND_CLOCKS.WORLD, delaySeconds: 1 });
  timeline.enqueue({ name: 'real-second', clock: SOUND_CLOCKS.REAL, delaySeconds: 1 });
  timeline.enqueue({ name: 'world-third', clock: SOUND_CLOCKS.WORLD, delaySeconds: 1 });
  assert.equal(timeline.advance({ realSeconds: 1, worldSeconds: 1 }), 3);
  assert.deepEqual(calls.map((e) => e.name), ['world-first', 'real-second', 'world-third']);
});

test('cancellation and reset suppress future playback without reusing IDs', () => {
  const { calls, timeline } = make();
  const cancelled = timeline.enqueue({ name: 'never', clock: SOUND_CLOCKS.WORLD, delaySeconds: 1 });
  assert.equal(timeline.cancel(cancelled), true);
  assert.equal(timeline.cancel(cancelled), false);
  timeline.enqueue({ name: 'reset', clock: SOUND_CLOCKS.REAL, delaySeconds: 2 });
  timeline.reset();
  const next = timeline.enqueue({ name: 'after', clock: SOUND_CLOCKS.REAL, delaySeconds: 0 });
  assert.ok(next > cancelled);
  assert.equal(timeline.flushDue(), 1);
  assert.deepEqual(calls.map((e) => e.name), ['after']);
  assert.equal(timeline.stats().cancelled, 2);
});

test('capacity and nonfinite or ambiguous timing are rejected', () => {
  const timeline = createSoundTimeline({ dispatch: () => true, maxPending: 1 });
  assert.throws(() => timeline.enqueue({ name: 'x', delaySeconds: 1 }), /clock/);
  assert.throws(() => timeline.enqueue({ name: 'x', clock: 'audio', delaySeconds: 1 }), /clock/);
  assert.throws(() => timeline.enqueue({ name: '', clock: SOUND_CLOCKS.REAL }), /name/);
  assert.throws(() => timeline.enqueue({ name: 'x', clock: SOUND_CLOCKS.REAL, delaySeconds: -1 }), /delaySeconds/);
  assert.throws(() => timeline.enqueue({ name: 'x', clock: SOUND_CLOCKS.REAL, delaySeconds: Infinity }), /delaySeconds/);
  assert.throws(() => timeline.enqueue({ name: 'x', clock: SOUND_CLOCKS.REAL, evidence: 'native' }), /evidence/);
  timeline.enqueue({ name: 'x', clock: SOUND_CLOCKS.REAL });
  assert.throws(() => timeline.enqueue({ name: 'y', clock: SOUND_CLOCKS.REAL }), /capacity/);
  assert.throws(() => timeline.advance({ realSeconds: NaN }), /realSeconds/);
  assert.throws(() => timeline.advance({ worldSeconds: -0.1 }), /worldSeconds/);
  assert.throws(() => timeline.advance({ paused: 1 }), /paused/);
  assert.equal(timeline.stats().pending, 1);
});

test('event metadata is snapshotted; evidence defaults unverified', () => {
  const { calls, timeline } = make();
  const params = { weapon: 'placeholder', gain: 0.5 };
  timeline.enqueue({ name: 'shot', clock: SOUND_CLOCKS.REAL, params });
  params.gain = 1;
  timeline.flushDue();
  assert.deepEqual(calls[0].params, { weapon: 'placeholder', gain: 0.5 });
  assert.equal(calls[0].evidence, SOUND_EVIDENCE.UNVERIFIED);
  assert.equal(Object.isFrozen(calls[0]), true);
  assert.equal(Object.isFrozen(calls[0].params), true);
});

test('rejected and throwing dispatches remain explicit, neither is counted audible', () => {
  const calls = [];
  const timeline = createSoundTimeline({ dispatch: (event) => {
    calls.push(event.name);
    if (event.name === 'unsupported') return false;
    if (event.name === 'fault') throw new Error('device error');
    return true;
  } });
  for (const name of ['unsupported', 'fault', 'ok']) timeline.enqueue({ name, clock: SOUND_CLOCKS.REAL });
  assert.equal(timeline.flushDue(), 3);
  assert.deepEqual(calls, ['unsupported', 'fault', 'ok']);
  assert.deepEqual(timeline.stats(), { enqueued: 3, accepted: 1, rejected: 1, failed: 1, cancelled: 0, pending: 0 });
  assert.deepEqual(timeline.getFailures(), [{ id: 2, message: 'device error' }]);
  assert.equal(timeline.flushDue(), 0);
});
