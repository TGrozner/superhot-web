import test from 'node:test';
import assert from 'node:assert/strict';
import { movementStep, PROTOTYPE_INPUT_RULES } from '../src/input.js';

// SH-02: numeric invariants of synthetic WEB caller rules only. No measured
// SUPERHOT: MIND CONTROL DELETE locomotion or speed contract is implied.

test('negative walk speed cannot invert the requested forward input', () => {
  const keys = new Set(['KeyW']);
  const rules = { ...PROTOTYPE_INPUT_RULES, walkSpeed: -2 };
  // Before the guard, KeyW with yaw=0, dt=1 produced dz=+2 (backwards).
  assert.throws(
    () => movementStep(keys, 0, 1, rules),
    { name: 'RangeError', message: /movement speed must be nonnegative/ },
  );
  assert.deepEqual([...keys], ['KeyW']);
  assert.equal(rules.walkSpeed, -2, 'rejected rules are never mutated');
});

test('negative sprint speed is rejected on the selected sprint path', () => {
  const rules = { ...PROTOTYPE_INPUT_RULES, sprintSpeed: -8.9 };
  assert.throws(
    () => movementStep(new Set(['KeyW', 'ShiftLeft']), Math.PI / 4, 1 / 60, rules),
    { name: 'RangeError', message: /movement speed must be nonnegative/ },
  );
});

test('negative selected speed is invalid even while idle', () => {
  assert.throws(
    () => movementStep(new Set(), 0, 1 / 60, { ...PROTOTYPE_INPUT_RULES, walkSpeed: -1 }),
    { name: 'RangeError', message: /movement speed must be nonnegative/ },
  );
  assert.throws(
    () => movementStep(new Set(['ShiftRight']), 0, 0, { ...PROTOTYPE_INPUT_RULES, sprintSpeed: -1 }),
    { name: 'RangeError', message: /movement speed must be nonnegative/ },
  );
});

test('zero selected speed is legal and produces no displacement', () => {
  const rules = { ...PROTOTYPE_INPUT_RULES, walkSpeed: 0, sprintSpeed: 0 };
  for (const keys of [new Set(['KeyW']), new Set(['KeyW', 'ShiftRight']), new Set()]) {
    const actual = movementStep(keys, Math.PI / 4, 0.05, rules);
    assert.equal(actual.speed, 0);
    assert.equal(Math.hypot(actual.dx, actual.dz), 0);
  }
});

test('positive default walking and sprint rules retain their existing magnitudes', () => {
  const walk = movementStep(new Set(['KeyW']), 0, 1);
  const sprint = movementStep(new Set(['KeyW', 'ShiftRight']), 0, 1);
  assert.equal(walk.speed, PROTOTYPE_INPUT_RULES.walkSpeed);
  assert.equal(sprint.speed, PROTOTYPE_INPUT_RULES.sprintSpeed);
  assert.ok(Math.abs(walk.dz + 6.7) < 1e-12);
  assert.ok(Math.abs(sprint.dz + 8.9) < 1e-12);
  assert.equal(PROTOTYPE_INPUT_RULES.walkSpeed, 6.7);
  assert.equal(PROTOTYPE_INPUT_RULES.sprintSpeed, 8.9);
});
