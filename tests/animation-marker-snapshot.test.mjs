import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceAnimationMarkers } from '../src/animation/event-markers.js';

test('clock rate is read once and event elapsedSeconds uses validated rate', () => {
  let reads = 0;
  const clock = { duration: 1, time: 0, get rate() { reads++; return reads === 1 ? 2 : 0; } };
  const result = advanceAnimationMarkers(clock, 0.5, [{ id: 'half', time: 0.5 }]);
  assert.equal(result.time, 1);
  assert.deepEqual(result.events.map(({ id, elapsedSeconds }) => [id, elapsedSeconds]), [['half', 0.25]]);
  assert.equal(reads, 1);
});

test('loop duration is read once for wrap and marker crossings', () => {
  let reads = 0;
  const clock = { time: 0.5, loop: true, get duration() { reads++; return reads === 1 ? 1 : 2; } };
  const result = advanceAnimationMarkers(clock, 0.5, [{ id: 'wrap', time: 0 }]);
  assert.equal(result.wraps, 1);
  assert.deepEqual(result.events.map(({ id, cycle }) => [id, cycle]), [['wrap', 1]]);
  assert.equal(reads, 1);
});

test('marker id is read once, so validation and emitted event agree', () => {
  let reads = 0;
  const marker = { get id() { reads++; return reads === 1 ? 'hit' : 'different'; }, time: 0.5 };
  const result = advanceAnimationMarkers({ duration: 1 }, 0.5, [marker]);
  assert.deepEqual(result.events.map((event) => event.id), ['hit']);
  assert.equal(reads, 1);
});

test('marker time is read once and the validated timestamp is emitted', () => {
  let reads = 0;
  const marker = { id: 'impact', get time() { reads++; return reads === 1 ? 0.5 : Infinity; } };
  const result = advanceAnimationMarkers({ duration: 1 }, 0.5, [marker]);
  assert.deepEqual(result.events.map(({ time, elapsedSeconds }) => [time, elapsedSeconds]), [[0.5, 0.5]]);
  assert.equal(reads, 1);
});

test('reads only one marker snapshot even when the source array is mutated by a getter', () => {
  const markers = [{ id: 'first', time: 0.5 }];
  Object.defineProperty(markers[0], 'id', { get() { markers[0] = { id: 'swapped', time: 0.9 }; return 'first'; } });
  const result = advanceAnimationMarkers({ duration: 1 }, 0.5, markers);
  assert.deepEqual(result.events.map(({ id }) => id), ['first']);
});
