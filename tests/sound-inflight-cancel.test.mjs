import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundTimeline, SOUND_CLOCKS } from '../src/sound/timeline.js';

const real = (name, delaySeconds = 0) => ({
  name, clock: SOUND_CLOCKS.REAL, delaySeconds,
});

test('cancel inside dispatch invalidates another event already due', () => {
  const observed = [];
  let secondId;
  const timeline = createSoundTimeline({
    dispatch(event) {
      observed.push(event.name);
      if (event.name === 'first') assert.equal(timeline.cancel(secondId), true);
      return true;
    },
  });
  timeline.enqueue(real('first'));
  secondId = timeline.enqueue(real('second'));
  assert.equal(timeline.flushDue(), 1);
  assert.deepEqual(observed, ['first']);
  assert.deepEqual(timeline.stats(), {
    enqueued: 2, accepted: 1, rejected: 0, failed: 0, cancelled: 1, pending: 0,
  });
  assert.equal(timeline.flushDue(), 0);
});

test('clear inside dispatch cancels due and future events', () => {
  const observed = [];
  const timeline = createSoundTimeline({
    dispatch(event) {
      observed.push(event.name);
      if (event.name === 'first') timeline.clear();
      return true;
    },
  });
  timeline.enqueue(real('first'));
  timeline.enqueue(real('also-due'));
  timeline.enqueue(real('future', 10));
  assert.equal(timeline.flushDue(), 1);
  assert.deepEqual(observed, ['first']);
  assert.equal(timeline.stats().cancelled, 2);
  assert.equal(timeline.stats().pending, 0);
  assert.equal(timeline.advance({ realSeconds: 10 }), 0);
});

test('reset inside dispatch invalidates the remaining batch without reusing IDs', () => {
  const observed = [];
  const timeline = createSoundTimeline({
    dispatch(event) {
      observed.push(event.name);
      if (event.name === 'first') timeline.reset();
      return true;
    },
  });
  const first = timeline.enqueue(real('first', 1));
  const second = timeline.enqueue(real('stale', 1));
  assert.equal(timeline.advance({ realSeconds: 1 }), 1);
  assert.deepEqual(observed, ['first']);
  assert.deepEqual(timeline.now(), { real: 0, world: 0 });
  assert.equal(timeline.stats().cancelled, 1);
  const fresh = timeline.enqueue(real('fresh'));
  assert.ok(fresh > second && second > first);
  assert.equal(timeline.flushDue(), 1);
  assert.deepEqual(observed, ['first', 'fresh']);
});

test('nested flush cannot recursively drain and callback-enqueued events defer', () => {
  const observed = [];
  let nestedResult;
  const timeline = createSoundTimeline({
    dispatch(event) {
      observed.push(event.name);
      if (event.name === 'first') {
        nestedResult = timeline.flushDue();
        timeline.enqueue(real('created-during-dispatch'));
      }
      return true;
    },
  });
  timeline.enqueue(real('first'));
  timeline.enqueue(real('second'));
  assert.equal(timeline.flushDue(), 2);
  assert.equal(nestedResult, 0);
  assert.deepEqual(observed, ['first', 'second']);
  assert.equal(timeline.stats().pending, 1);
  assert.equal(timeline.flushDue(), 1);
  assert.deepEqual(observed, ['first', 'second', 'created-during-dispatch']);
  assert.equal(timeline.stats().accepted, 3);
});
