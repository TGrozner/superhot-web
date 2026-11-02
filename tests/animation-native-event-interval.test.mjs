import test from 'node:test';
import assert from 'node:assert/strict';
import { scanNativeEventInterval } from '../src/animation/native-event-interval.js';

const events = [
  { id: 'a', time: 0 }, { id: 'b', time: 0.25 },
  { id: 'c', time: 0.5 }, { id: 'd', time: 1 },
];
const ids = (list) => list.map(({ id }) => id);

test('MCD native forward event interval opens last and closes current', () => {
  assert.deepEqual(ids(scanNativeEventInterval(events, 0, 0.5)), ['b', 'c']);
  assert.deepEqual(ids(scanNativeEventInterval(events, 0.5, 1)), ['d']);
});

test('MCD native reverse event interval closes current and opens last', () => {
  assert.deepEqual(ids(scanNativeEventInterval(events, 1, 0.25)), ['c', 'b']);
  assert.deepEqual(ids(scanNativeEventInterval(events, 0.5, 0)), ['b', 'a']);
});

test('equal prepared times do not scan animation callbacks', () => {
  assert.deepEqual(scanNativeEventInterval(events, 0.5, 0.5), []);
  assert.deepEqual(scanNativeEventInterval([], 0, 1), []);
});

test('crossings preserve caller IDs and have no dispatch side effects', () => {
  assert.deepEqual(scanNativeEventInterval(events, 0, 0.25),
    [{ id: 'b', time: 0.25, index: 1 }]);
  assert.deepEqual(events[1], { id: 'b', time: 0.25 });
});

test('input validity is checked instead of inferring graph or weight state', () => {
  assert.throws(() => scanNativeEventInterval(events, NaN, 1), /finite/);
  assert.throws(() => scanNativeEventInterval([
    { id: 'x', time: 1 }, { id: 'y', time: 0 },
  ], 0, 1), /sorted/);
  assert.throws(() => scanNativeEventInterval([{ id: 'x', time: Infinity }], 0, 1), /finite/);
});
