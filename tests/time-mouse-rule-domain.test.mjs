import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMouseLook, PROTOTYPE_INPUT_RULES } from '../src/input.js';

// SH-02: domain invariants of caller-provided WEB prototype rules.
// Synthetic fixtures only: NOT SUPERHOT MCD input/camera parity evidence.

const sample = Object.freeze({ yaw: 0.3, pitch: 0.2, movementX: 34, movementY: 40 });

test('inverted pitch limits are rejected rather than flipping the clamp', () => {
  for (const pitchLimit of [-0.5, -Number.MIN_VALUE]) {
    assert.throws(
      () => applyMouseLook(sample, { ...PROTOTYPE_INPUT_RULES, pitchLimit }),
      { name: 'RangeError', message: /pitchLimit must be nonnegative/ },
    );
  }
  assert.equal(sample.pitch, 0.2, 'input is never mutated on rejection');
});

test('zero or negative look divisors cannot saturate or suppress activity', () => {
  for (const lookActivityDivisor of [0, -34]) {
    assert.throws(
      () => applyMouseLook(sample, { ...PROTOTYPE_INPUT_RULES, lookActivityDivisor }),
      { name: 'RangeError', message: /lookActivityDivisor must be positive/ },
    );
  }
});

test('minimum look activity must stay in the declared normalized range', () => {
  for (const minimumLookActivity of [-0.1, 1.1]) {
    assert.throws(
      () => applyMouseLook(sample, { ...PROTOTYPE_INPUT_RULES, minimumLookActivity }),
      { name: 'RangeError', message: /minimumLookActivity must be within/ },
    );
  }
});

test('non-finite mouse rule boundaries are rejected explicitly', () => {
  for (const [key, message] of [
    ['pitchLimit', /pitch must remain finite/],
    ['lookActivityDivisor', /lookActivity must remain finite/],
    ['minimumLookActivity', /lookActivity must remain finite/],
  ]) {
    assert.throws(
      () => applyMouseLook(sample, { ...PROTOTYPE_INPUT_RULES, [key]: Infinity }),
      { name: 'RangeError', message },
    );
  }
});

test('valid zero/one endpoints and existing Web defaults retain their behavior', () => {
  const idle = { yaw: 0, pitch: 0.4, movementX: 0, movementY: 0 };
  const floorZero = applyMouseLook(idle, {
    ...PROTOTYPE_INPUT_RULES, pitchLimit: 0, minimumLookActivity: 0,
  });
  assert.equal(floorZero.pitch, 0);
  assert.equal(floorZero.lookActivity, 0);

  const floorOne = applyMouseLook(idle, {
    ...PROTOTYPE_INPUT_RULES, minimumLookActivity: 1,
  });
  assert.equal(floorOne.lookActivity, 1);

  const usual = applyMouseLook({ yaw: 0, pitch: 0, movementX: 34, movementY: 0 });
  assert.equal(usual.yaw, 34 * PROTOTYPE_INPUT_RULES.mouseSensitivity);
  assert.equal(usual.pitch, 0);
  assert.equal(usual.lookActivity, 1);
  assert.equal(PROTOTYPE_INPUT_RULES.pitchLimit, 1.42);
  assert.equal(PROTOTYPE_INPUT_RULES.lookActivityDivisor, 34);
  assert.equal(PROTOTYPE_INPUT_RULES.minimumLookActivity, 0.12);
  assert.deepEqual(idle, { yaw: 0, pitch: 0.4, movementX: 0, movementY: 0 });
});
