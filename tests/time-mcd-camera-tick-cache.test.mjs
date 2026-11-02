import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MCD_SOURCE_INPUT_TICK_SENTINEL,
  createMcdSourceCameraTickState,
  readMcdSourceCameraTick,
  resetMcdSourceCameraTick,
} from '../src/input.js';

// All numeric sensitivities and axes here are SYNTHETIC test inputs.
// Evidence: private research #119 SHInput.cs:84-99; #114 SHInputCamera.cs:25-34;
// #107 SHInputCamera.cs:35-69, MCD Steam build 20299547.
// These tests do not execute Unity, InControl, Containers or a browser.
const config = Object.freeze({
  mouseSensitivityX: 2,
  mouseSensitivityY: 3,
  gamepadSensitivityX: 4,
  gamepadSensitivityY: 5,
  deadzone: 0.1,
  exponent: 2,
  unscaledDeltaTime: 1 / 120,
});
const mouse = (x, y) => ({ name: 'Keyboard/Mouse', rightStickX: x, rightStickY: y });
const pad = (x, y) => ({ name: 'Xbox', rightStickX: x, rightStickY: y });
const approx = (actual, expected) => assert.ok(
  Math.abs(actual - expected) <= 1e-8,
  `expected ${actual} approximately ${expected}`,
);
const sample = (state, values = {}) => readMcdSourceCameraTick(state, {
  ...config,
  currentTick: 5n,
  activeDeviceName: 'Keyboard/Mouse',
  devices: [mouse(1, -2)],
  ...values,
});

test('uninitialized GetInput returns zero without consulting active tick or altering cached data', () => {
  const initial = createMcdSourceCameraTickState();
  assert.equal(initial.lastInputReadTimestamp, MCD_SOURCE_INPUT_TICK_SENTINEL);
  const seeded = { ...initial, data: { x: 9, y: -9 } };
  const read = readMcdSourceCameraTick(seeded);
  assert.deepEqual(read.data, { x: 0, y: 0 });
  assert.deepEqual(read.state, seeded);
  assert.equal(read.readNewInput, false);
  assert.equal(read.reason, 'not_initialized');
});

test('initialized camera reads one mouse tick and preserves source tick metadata', () => {
  const state = createMcdSourceCameraTickState({ wasInit: true });
  const read = sample(state);
  assert.deepEqual(read.data, { x: 2, y: -6 });
  assert.equal(read.readNewInput, true);
  assert.equal(read.state.lastInputReadTimestamp, 5n);
  assert.equal(read.state.keyboard, true);
  assert.equal(state.lastInputReadTimestamp, MCD_SOURCE_INPUT_TICK_SENTINEL);
});

test('two reads in one InControl tick return previous delta despite changed axes and config', () => {
  const first = sample(createMcdSourceCameraTickState({ wasInit: true }));
  const second = sample(first.state, {
    devices: null, mouseSensitivityX: Number.NaN,
    activeDeviceName: 'Virtual Keyboard/Mouse Device',
  });
  assert.deepEqual(second.data, first.data);
  assert.equal(second.readNewInput, false);
  assert.equal(second.reason, 'cached_tick');
  // Inherited SHInput.Update updates this substring flag BEFORE its tick gate.
  assert.equal(second.state.keyboard, true);
  assert.equal(second.state.lastInputReadTimestamp, 5n);
  assert.deepEqual(first.state.data, first.data);
});

test('next tick recomputes summed mouse+pad data then applies unscaled dt to entire sum', () => {
  const first = sample(createMcdSourceCameraTickState({ wasInit: true }));
  const second = sample(first.state, {
    currentTick: 6n, activeDeviceName: 'Xbox',
    devices: [mouse(1, 2), pad(0.5, -0.5)],
  });
  // Native pad curve has asymmetric negative branch:
  // +0.5 -> (0.5-0.1)^2; -0.5 -> -(abs(-0.5-0.1)^2).
  approx(second.data.x, (2 + 0.16 * 4) * 0.5);
  approx(second.data.y, (6 - 0.36 * 5) * 0.5);
  assert.equal(second.readNewInput, true);
  assert.equal(second.state.keyboard, false);
  assert.equal(second.state.lastInputReadTimestamp, 6n);
});

test('SHInput keyboard substring flag is NOT SHInputCamera exact-name routing', () => {
  const virtual = 'Virtual Keyboard/Mouse Device';
  const result = sample(createMcdSourceCameraTickState({ wasInit: true }), {
    activeDeviceName: virtual,
    devices: [{ name: virtual, rightStickX: 0.5, rightStickY: 0 }],
  });
  assert.equal(result.state.keyboard, true);
  // Name is not exactly Keyboard/Mouse; native GetInput takes PAD branch.
  // Active name is not exactly Keyboard/Mouse; native global dt factor applies.
  approx(result.data.x, 0.16 * 4 * 0.5);
  assert.equal(result.data.y, 0);
});

test('Reset invalidates tick identity but retains old data until the next read', () => {
  const first = sample(createMcdSourceCameraTickState({ wasInit: true }));
  const reset = resetMcdSourceCameraTick(first.state);
  assert.equal(reset.lastInputReadTimestamp, MCD_SOURCE_INPUT_TICK_SENTINEL);
  assert.deepEqual(reset.data, first.data);
  const rerun = sample(reset, { devices: [mouse(3, 0)] });
  assert.deepEqual(rerun.data, { x: 6, y: 0 });
  assert.equal(rerun.readNewInput, true);
  assert.deepEqual(first.data, { x: 2, y: -6 });
});

test('unscaled dt zero affects active pad but not exact keyboard/mouse delta', () => {
  const state = createMcdSourceCameraTickState({ wasInit: true });
  const padRead = sample(state, {
    activeDeviceName: 'Xbox', devices: [mouse(2, 1), pad(1, 1)],
    unscaledDeltaTime: 0,
  });
  assert.deepEqual(padRead.data, { x: 0, y: 0 });
  const mouseRead = sample(padRead.state, {
    currentTick: 6n, activeDeviceName: 'Keyboard/Mouse',
    devices: [mouse(2, 1)], unscaledDeltaTime: 0,
  });
  assert.deepEqual(mouseRead.data, { x: 4, y: 3 });
});

test('uint64 BigInt tick and explicit source inputs are required on new reads', () => {
  const state = createMcdSourceCameraTickState({ wasInit: true });
  assert.throws(() => sample(state, { currentTick: 5 }), /uint64 BigInt/);
  assert.throws(() => sample(state, { currentTick: -1n }), /uint64 BigInt/);
  assert.throws(() => sample(state, { activeDeviceName: null }), /activeDeviceName/);
  assert.throws(() => sample(state, { devices: null }), /devices/);
  assert.throws(() => sample(state, { devices: [pad(Number.NaN, 0)] }), /finite/);
});
