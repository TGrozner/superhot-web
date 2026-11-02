import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundTimeline, SOUND_CLOCKS, SOUND_EVIDENCE } from '../src/sound/timeline.js';
import { createPrototypeSoundSink } from '../src/sound/prototype-sink.js';

const event = (name, evidence = SOUND_EVIDENCE.PROTOTYPE) => ({
  name, clock: SOUND_CLOCKS.REAL, evidence,
});

test('a resolved Promise from dispatch is not mistaken for synchronous acceptance', async () => {
  const timeline = createSoundTimeline({ dispatch: () => Promise.resolve(false) });
  timeline.enqueue(event('async-result'));
  assert.equal(timeline.flushDue(), 1);
  assert.deepEqual(timeline.stats(), {
    enqueued: 1, accepted: 0, rejected: 0, failed: 1, cancelled: 0, pending: 0,
  });
  assert.match(timeline.getFailures()[0].message, /must be synchronous/);
  await Promise.resolve();
  assert.equal(timeline.stats().accepted, 0);
});

test('a rejected Promise is observed; later synchronous events still dispatch', async () => {
  const calls = [];
  const timeline = createSoundTimeline({
    dispatch: ({ name }) => {
      calls.push(name);
      if (name === 'async-reject') return Promise.reject(new Error('device refused'));
      return true;
    },
  });
  timeline.enqueue(event('async-reject'));
  timeline.enqueue(event('sync-accepted'));
  assert.equal(timeline.flushDue(), 2);
  assert.deepEqual(calls, ['async-reject', 'sync-accepted']);
  assert.equal(timeline.stats().failed, 1);
  assert.equal(timeline.stats().accepted, 1);
  assert.match(timeline.getFailures()[0].message, /must be synchronous/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timeline.stats().failed, 1);
});

test('synthetic adapter rejects asynchronous replacements without claiming sound playback', async () => {
  const sink = createPrototypeSoundSink({
    shoot() { return Promise.reject(new Error('AudioContext resume rejected')); },
  });
  const timeline = createSoundTimeline({ dispatch: sink });
  timeline.enqueue(event('shoot'));
  assert.equal(timeline.flushDue(), 1);
  assert.equal(timeline.stats().accepted, 0);
  assert.equal(timeline.stats().failed, 1);
  assert.match(timeline.getFailures()[0].message, /synthetic sound method must be synchronous/);
  await new Promise((resolve) => setImmediate(resolve));
});

test('existing synchronous prototype audio contract remains unchanged', () => {
  const called = [];
  const sink = createPrototypeSoundSink({ shoot() { called.push('shoot'); } });
  const timeline = createSoundTimeline({ dispatch: sink });
  timeline.enqueue(event('shoot'));
  timeline.enqueue(event('unverified', SOUND_EVIDENCE.UNVERIFIED));
  assert.equal(timeline.flushDue(), 2);
  assert.deepEqual(called, ['shoot']);
  assert.equal(timeline.stats().accepted, 1);
  assert.equal(timeline.stats().rejected, 1);
  assert.equal(timeline.stats().failed, 0);
});

test('unprintable dispatch diagnostic does not abort later eligible events', () => {
  const calls = [];
  const opaque = { get message() { throw new Error('unreadable message'); } };
  const timeline = createSoundTimeline({
    dispatch({ name }) {
      calls.push(name);
      if (name === 'opaque') throw opaque;
      return true;
    },
  });
  timeline.enqueue(event('opaque'));
  timeline.enqueue(event('good'));
  assert.equal(timeline.flushDue(), 2);
  assert.deepEqual(calls, ['opaque', 'good']);
  assert.equal(timeline.stats().failed, 1);
  assert.equal(timeline.stats().accepted, 1);
  assert.equal(timeline.getFailures()[0].message, 'unprintable sound dispatch error');
});

test('unprintable string conversion records only one failure', () => {
  const opaque = { message: { toString() { throw new Error('conversion failed'); } } };
  const timeline = createSoundTimeline({ dispatch: () => { throw opaque; } });
  timeline.enqueue(event('opaque'));
  assert.equal(timeline.flushDue(), 1);
  assert.equal(timeline.flushDue(), 0);
  assert.equal(timeline.stats().failed, 1);
  assert.equal(timeline.getFailures()[0].message, 'unprintable sound dispatch error');
});
