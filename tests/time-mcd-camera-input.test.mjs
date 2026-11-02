import test from 'node:test';
import assert from 'node:assert/strict';
import { mcdSourcePadCurve, mcdSourceCameraInputDelta } from '../src/input.js';

// SYNTHETIC fixture: numbers reproduce source-serialized examples in
// level28:CameraLook18825 (research #38), NOT effective user sensitivities
// or observed Containers runtime values.
const settings = {
  activeDeviceIsKeyboardMouse: true,
  mouseSensitivityX: 2.5, mouseSensitivityY: 1.3,
  gamepadSensitivityX: 3.05, gamepadSensitivityY: 0.8,
  deadzone: 0.03, exponent: 2.6, unscaledDeltaTime: 1 / 120,
};
const mouse = (rightStickX, rightStickY) => ({ isKeyboardMouse: true, rightStickX, rightStickY });
const pad = (rightStickX, rightStickY) => ({ isKeyboardMouse: false, rightStickX, rightStickY });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('source camera input: mouse axes use injected effective sensitivity, not DOM radians', () => {
  assert.deepEqual(mcdSourceCameraInputDelta({ ...settings, devices: [mouse(2, -3)] }), { x: 5, y: -3.9000000000000004 });
});

test('source pad curve: deadzone is inclusive, negative branch is asymmetric', () => {
  assert.equal(mcdSourcePadCurve(0.03, 0.03, 2.6), 0);
  assert.equal(mcdSourcePadCurve(-0.03, 0.03, 2.6), 0);
  near(mcdSourcePadCurve(0.5, 0.03, 2.6), Math.pow(0.47, 2.6));
  near(mcdSourcePadCurve(-0.5, 0.03, 2.6), -Math.pow(0.53, 2.6));
  assert.ok(Math.abs(mcdSourcePadCurve(-0.5, 0.03, 2.6)) > mcdSourcePadCurve(0.5, 0.03, 2.6));
});

test('source camera input sums all devices, regardless of active device', () => {
  const devices = [mouse(1, 2), pad(0.5, -0.5), mouse(-0.5, 0.25)];
  const expectedX = 0.5 * settings.mouseSensitivityX + Math.pow(0.47, 2.6) * settings.gamepadSensitivityX;
  const expectedY = 2.25 * settings.mouseSensitivityY - Math.pow(0.53, 2.6) * settings.gamepadSensitivityY;
  const mouseActive = mcdSourceCameraInputDelta({ ...settings, devices });
  near(mouseActive.x, expectedX); near(mouseActive.y, expectedY);
  const padActive = mcdSourceCameraInputDelta({ ...settings, devices, activeDeviceIsKeyboardMouse: false });
  near(padActive.x, expectedX * 0.5);
  near(padActive.y, expectedY * 0.5);
});

test('source active pad scales even mouse contributions AFTER the sum', () => {
  const devices = [mouse(2, 3)];
  const normal = mcdSourceCameraInputDelta({ ...settings, devices });
  const activePad = mcdSourceCameraInputDelta({ ...settings, devices, activeDeviceIsKeyboardMouse: false });
  near(activePad.x, normal.x * 0.5);
  near(activePad.y, normal.y * 0.5);
});

test('source zero unscaled delta freezes pad-active input, not keyboard-active input', () => {
  const devices = [mouse(2, 1), pad(0.4, 0.2)];
  const frozen = mcdSourceCameraInputDelta({ ...settings, devices, activeDeviceIsKeyboardMouse: false, unscaledDeltaTime: 0 });
  assert.deepEqual(frozen, { x: 0, y: 0 });
  const activeMouse = mcdSourceCameraInputDelta({ ...settings, devices, unscaledDeltaTime: 0 });
  assert.ok(activeMouse.x > 0 && activeMouse.y > 0);
});

test('source explicit parameters: no implicit flags or invented sensitivities', () => {
  assert.throws(() => mcdSourceCameraInputDelta({ ...settings, devices: [], activeDeviceIsKeyboardMouse: undefined }), TypeError);
  assert.throws(() => mcdSourceCameraInputDelta({ ...settings, devices: [mouse(1, 1)], exponent: undefined }), RangeError);
  assert.throws(() => mcdSourceCameraInputDelta({ ...settings, devices: [{ rightStickX: 1, rightStickY: 1 }] }), TypeError);
  assert.throws(() => mcdSourceCameraInputDelta({ ...settings, devices: [pad(NaN, 0)] }), RangeError);
});
