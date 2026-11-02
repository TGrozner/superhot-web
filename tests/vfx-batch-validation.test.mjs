import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFragment, advanceFragments } from '../src/vfx/procedural-fragments.js';

const particle = () => ({
  id: 7,
  position: { x: 2, y: 0, z: 0 },
  velocity: { x: 3, y: 0, z: 0 },
  age: 0,
  lifetime: 2,
});

test('an empty burst still validates finite, non-negative frame delta', () => {
  assert.deepEqual(advanceFragments([], 0), []);
  assert.deepEqual(advanceFragments([], 0.5), []);
  assert.throws(() => advanceFragments([], -0.5), RangeError);
  assert.throws(() => advanceFragments([], NaN), TypeError);
  assert.throws(() => advanceFragments([], Infinity), TypeError);
  assert.throws(() => advanceFragments([], undefined), TypeError);
});

test('an empty burst still validates every acceleration component', () => {
  assert.deepEqual(advanceFragments([], 0, { x: 0, y: 0, z: 0 }), []);
  assert.throws(() => advanceFragments([], 0, null), TypeError);
  assert.throws(() => advanceFragments([], 0, { x: NaN, y: 0, z: 0 }), TypeError);
  assert.throws(() => advanceFragments([], 0, { x: 0, y: Infinity, z: 0 }), TypeError);
  assert.throws(() => advanceFragments([], 0, { x: 0, y: 0 }), TypeError);
});

test('batch stepping remains equivalent to scalar stepping with explicit acceleration', () => {
  const source = particle();
  const acceleration = Object.freeze({ x: -2, y: 0, z: 0 });
  const expected = advanceFragment(source, 0.5, acceleration);
  assert.deepEqual(advanceFragments([source], 0.5, acceleration), [expected]);
  assert.deepEqual(source, particle()); // Pure update, no mutation.
});

test('omitted acceleration defaults to zero on populated and empty batches', () => {
  const source = particle();
  assert.deepEqual(advanceFragments([source], 0.5), [advanceFragment(source, 0.5)]);
  assert.deepEqual(advanceFragments([], 0.5), []);
});
