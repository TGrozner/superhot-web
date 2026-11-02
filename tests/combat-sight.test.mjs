import test from 'node:test';
import assert from 'node:assert/strict';
import { hasLineOfSight } from '../src/combat/sight.js';

const v = (x, y = 0, z = 0) => ({ x, y, z });
test('an unobstructed ray remains visible', () => {
  assert.equal(hasLineOfSight(v(0), v(10)), true);
});
test('an intervening wall blocks visibility', () => {
  const wall = { min: v(4, -1, -1), max: v(6, 1, 1) };
  assert.equal(hasLineOfSight(v(0), v(10), [wall]), false);
  assert.equal(hasLineOfSight(v(0, 3), v(10, 3), [wall]), true);
});
test('a wall at the target point counts as obstructing; policy remains provisional', () => {
  const wall = { min: v(10, -1, -1), max: v(11, 1, 1) };
  assert.equal(hasLineOfSight(v(0), v(10), [wall]), false);
});
