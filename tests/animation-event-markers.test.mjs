import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceAnimationMarkers } from '../src/animation/event-markers.js';

const ids = (result) => result.events.map(({ id, cycle }) => `${id}:${cycle}`);

test('non-looping markers fire only on crossing and include exact finish', () => {
  const markers = [{ id: 'begin', time: 0 }, { id: 'middle', time: 0.5 }, { id: 'finish', time: 1 }];
  const first = advanceAnimationMarkers({ duration: 1, time: 0 }, 0.5, markers);
  assert.deepEqual(ids(first), ['middle:0']);
  assert.equal(first.events[0].elapsedSeconds, 0.5);
  const last = advanceAnimationMarkers({ duration: 1, time: 0.5 }, 8, markers);
  assert.deepEqual(ids(last), ['finish:0']);
  assert.equal(last.finished, true);
  assert.deepEqual(advanceAnimationMarkers({ duration: 1, time: 1 }, 1, markers).events, []);
});

test('loop boundary fires time-zero marker, not the initial time-zero position', () => {
  const markers = [{ id: 'start', time: 0 }, { id: 'near', time: 0.75 }];
  assert.deepEqual(ids(advanceAnimationMarkers({ duration: 1, loop: true }, 0.5, markers)), []);
  const crossing = advanceAnimationMarkers({ duration: 1, time: 0.5, loop: true }, 0.5, markers);
  assert.deepEqual(ids(crossing), ['near:0', 'start:1']);
  assert.equal(crossing.wraps, 1);
  assert.equal(crossing.time, 0);
  assert.deepEqual(crossing.events.map(x => x.elapsedSeconds), [0.25, 0.5]);
});

test('multi-wrap jump preserves order, marker identity, and repeated names', () => {
  const markers = [
    { id: 'footstep', time: 0.5 },
    { id: 'footstep', time: 0.5 },
    { id: 'cycle', time: 0 },
  ];
  const result = advanceAnimationMarkers({ duration: 1, loop: true, time: 0.25 }, 2.5, markers);
  assert.deepEqual(ids(result), [
    'footstep:0', 'footstep:0', 'cycle:1',
    'footstep:1', 'footstep:1', 'cycle:2',
    'footstep:2', 'footstep:2',
  ]);
  assert.deepEqual(result.events.slice(0, 2).map(x => x.index), [0, 1]);
  assert.equal(result.wraps, 2);
  assert.equal(result.time, 0.75);
});

test('pause and zero rate emit nothing and leave input immutable', () => {
  const clock = Object.freeze({ duration: 2, time: 0.5, loop: true, paused: true });
  const markers = Object.freeze([Object.freeze({ id: 'action', time: 1 })]);
  assert.deepEqual(advanceAnimationMarkers(clock, 8, markers).events, []);
  assert.deepEqual(advanceAnimationMarkers({ ...clock, paused: false, rate: 0 }, 8, markers).events, []);
  assert.equal(clock.time, 0.5);
});

test('caller rate changes event offsets but not clip-local timing', () => {
  const result = advanceAnimationMarkers({ duration: 2, rate: 2, time: 0 }, 1, [
    { id: 'a', time: 0.5 }, { id: 'b', time: 1.5 },
  ]);
  assert.deepEqual(result.events.map(x => x.elapsedSeconds), [0.25, 0.75]);
});

test('large loop jump fails explicitly instead of truncating animation events', () => {
  assert.throws(() => advanceAnimationMarkers(
    { duration: 1, loop: true }, 3000, [{ id: 'one', time: 0.5 }], { maxOccurrences: 5 },
  ), /occurrence limit/);
  assert.throws(() => advanceAnimationMarkers(
    { duration: 1, loop: true }, 5000, [{ id: 'one', time: 0.5 }],
  ), /occurrence limit/);
});

test('rejects malformed markers and clip domains', () => {
  const clock = { duration: 1, loop: true };
  assert.throws(() => advanceAnimationMarkers(clock, 1, [null]), TypeError);
  assert.throws(() => advanceAnimationMarkers(clock, 1, [{ id: '', time: 0 }]), TypeError);
  assert.throws(() => advanceAnimationMarkers(clock, 1, [{ id: 'x', time: NaN }]), TypeError);
  assert.throws(() => advanceAnimationMarkers(clock, 1, [{ id: 'x', time: 1 }]), RangeError);
  assert.throws(() => advanceAnimationMarkers({ duration: 1 }, 1, [{ id: 'x', time: 1.1 }]), RangeError);
  assert.throws(() => advanceAnimationMarkers(clock, 1, [], { maxOccurrences: 0 }), RangeError);
});

test('partitioning into smaller advances does not double-fire a boundary', () => {
  const markers = [{ id: 'quarter', time: 0.25 }, { id: 'zero', time: 0 }];
  const large = advanceAnimationMarkers({ duration: 1, loop: true }, 2, markers);
  let clock = { duration: 1, loop: true };
  const stepped = [];
  for (let i = 0; i < 4; i++) {
    const result = advanceAnimationMarkers(clock, 0.5, markers);
    stepped.push(...result.events.map(event => event.id));
    clock = { ...clock, time: result.time };
  }
  assert.deepEqual(stepped, large.events.map(event => event.id));
  assert.deepEqual(stepped, ['quarter', 'zero', 'quarter', 'zero']);
});
