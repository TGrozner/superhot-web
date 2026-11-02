import test from 'node:test';
import assert from 'node:assert/strict';
import { updatePressedKeys, movementAxes, keydownAction } from '../src/input.js';

test('keydown (including repeats), keyup and screen-clear use immutable pressed-key snapshots', () => {
  const empty = new Set();
  const first = updatePressedKeys(empty, { type: 'keydown', code: 'KeyW' });
  assert.deepEqual([...empty], []);
  assert.deepEqual([...first], ['KeyW']);
  const repeat = updatePressedKeys(first, { type: 'keydown', code: 'KeyW' });
  assert.deepEqual([...repeat], ['KeyW']);
  assert.notStrictEqual(repeat, first);
  const diagonal = updatePressedKeys(repeat, { type: 'keydown', code: 'ArrowRight' });
  assert.deepEqual(movementAxes(diagonal), { forward: 1, horizontal: 1, moving: true });
  const released = updatePressedKeys(diagonal, { type: 'keyup', code: 'KeyW' });
  assert.deepEqual(movementAxes(released), { forward: 0, horizontal: 1, moving: true });
  const paused = updatePressedKeys(released, { type: 'clear' });
  assert.deepEqual(movementAxes(paused), { forward: 0, horizontal: 0, moving: false });
  assert.deepEqual([...diagonal], ['KeyW', 'ArrowRight'], 'input snapshots are not mutated by clear');
  assert.equal(keydownAction({ code: 'KeyR', screen: 'paused' }), null, 'pause gates actions independently');
});

test('pressed key transitions reject malformed events rather than silently retaining movement', () => {
  const empty = new Set();
  assert.throws(() => updatePressedKeys(null, {type: 'clear'}), TypeError);
  assert.throws(() => updatePressedKeys(empty, {type: 'keydown'}), TypeError);
  assert.throws(() => updatePressedKeys(empty, {type: 'unknown', code: 'KeyW'}), TypeError);
  assert.throws(() => updatePressedKeys(empty, {type: 'keyup', code: ''}), TypeError);
});
