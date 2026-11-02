import test from 'node:test';
import assert from 'node:assert/strict';
import { getTargetTimeScale, PROTOTYPE_TIME_RULES } from '../src/time.js';
import { applyMouseLook, movementStep, PROTOTYPE_INPUT_RULES } from '../src/input.js';

// SH-02: WEB prototype API boundary only. These fixtures use synthetic rules.
// They are NOT a native SUPERHOT: MIND CONTROL DELETE ruleset or parity trace.

test('direct target-scale queries reject NaN rules instead of returning NaN', () => {
  const rules = { ...PROTOTYPE_TIME_RULES, minimumScale: NaN };
  assert.throws(
    () => getTargetTimeScale({}, rules),
    { name: 'RangeError', message: /targetScale must be finite/ },
  );
});

test('finite but extreme synthetic rules cannot overflow direct target queries', () => {
  const rules = { ...PROTOTYPE_TIME_RULES, lookScaleFactor: Number.MAX_VALUE };
  assert.throws(
    () => getTargetTimeScale({ lookActivity: 2 }, rules),
    { name: 'RangeError', message: /targetScale must be finite/ },
  );
});

test('idle movement cannot report a NaN speed from an injected ruleset', () => {
  const keys = new Set();
  const rules = { ...PROTOTYPE_INPUT_RULES, walkSpeed: NaN };
  assert.throws(
    () => movementStep(keys, 0, 1 / 60, rules),
    { name: 'RangeError', message: /movement speed must be finite/ },
  );
  assert.equal(keys.size, 0, 'failed read does not mutate held keys');
});

test('sprinting movement rejects a non-finite configured speed before displacement', () => {
  const rules = { ...PROTOTYPE_INPUT_RULES, sprintSpeed: Infinity };
  assert.throws(
    () => movementStep(new Set(['KeyW', 'ShiftLeft']), 0, 1 / 60, rules),
    { name: 'RangeError', message: /movement speed must be finite/ },
  );
});

test('mouse look refuses non-finite pitch caused by an invalid custom limit', () => {
  const state = { yaw: 0, pitch: 0, movementX: 0, movementY: 3 };
  assert.throws(
    () => applyMouseLook(state, { ...PROTOTYPE_INPUT_RULES, pitchLimit: NaN }),
    { name: 'RangeError', message: /pitch must remain finite/ },
  );
  assert.deepEqual(state, { yaw: 0, pitch: 0, movementX: 0, movementY: 3 });
});

test('mouse look refuses a NaN activity caused by a malformed divisor', () => {
  const state = { yaw: 0, pitch: 0, movementX: 7, movementY: 11 };
  assert.throws(
    () => applyMouseLook(state, { ...PROTOTYPE_INPUT_RULES, lookActivityDivisor: NaN }),
    { name: 'RangeError', message: /lookActivity must remain finite/ },
  );
});

test('finite synthetic configurations still calculate normally without changing defaults', () => {
  const timeRules = { ...PROTOTYPE_TIME_RULES, movingScale: 0.5 };
  assert.equal(getTargetTimeScale({ moving: true }, timeRules), 0.5);
  const inputRules = { ...PROTOTYPE_INPUT_RULES, walkSpeed: 2, mouseSensitivity: 0.01 };
  const motion = movementStep(new Set(['KeyW']), 0, 1, inputRules);
  assert.equal(motion.dz, -2);
  const look = applyMouseLook({ yaw: 0, pitch: 0, movementX: 10, movementY: 4 }, inputRules);
  assert.equal(look.yaw, 0.1);
  assert.equal(look.pitch, -0.04);
  assert.ok(Number.isFinite(look.lookActivity));
  assert.equal(PROTOTYPE_TIME_RULES.movingScale, 0.98);
  assert.equal(PROTOTYPE_INPUT_RULES.walkSpeed, 6.7);
});
