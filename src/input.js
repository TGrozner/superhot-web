/**
 * Pure, browser-independent input interpretation for FRAME//BREAK.
 * PROVENANCE: superhot-web/src/main.js at 9f01f92411b4e125b2c992deee53602a8c67c416.
 * STATUS: PROVISIONAL Web behavior, NOT verified SUPERHOT MCD parity.
 *
 * Browser event listeners, focus and pointer-lock acquisition are intentionally
 * not executed here. `KeyboardEvent.code` values are physical-key codes.
 * Web-only numeric guards reject overflowing or malformed rule outputs without changing
 * the prototype's movement or camera coefficients.
 * Primary delivered keyboard-profile code now proves R=Replay/Back but does
 * not prove which profile or rebind is active. `KeyR` retains the WEB
 * PROTOTYPE's reload action; source labels below are opt-in metadata only.
 */
export const PROTOTYPE_INPUT_RULES = Object.freeze({
  walkSpeed: 6.7,
  sprintSpeed: 8.9,
  mouseSensitivity: 0.00245,
  pitchLimit: 1.42,
  lookActivityDivisor: 34,
  minimumLookActivity: 0.12,
});

const PREVENT_DEFAULT_CODES = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const FWD = ['KeyW', 'KeyZ', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const RIGHT = ['KeyD', 'ArrowRight'];
const LEFT = ['KeyA', 'ArrowLeft'];
const SPRINT = ['ShiftLeft', 'ShiftRight'];

const anyPressed = (keys, options) => options.some((key) => keys.has(key));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Whether a browser keydown handler should suppress page movement. */
export const shouldPreventDefault = (code) => PREVENT_DEFAULT_CODES.has(code);

/**
 * Pure pressed-key buffer reducer matching existing WEB event ordering.
 * Browser keydown adds the key even on auto-repeat, keyup removes it, and
 * setScreen(non-playing) clears the entire buffer. Callers own that screen
 * transition and must not keep held movement keys across pause/resume.
 * Input snapshots remain immutable; native MCD key-buffer semantics UNKNOWN.
 */
export function updatePressedKeys(keys, { type, code } = {}) {
  if (!keys || typeof keys[Symbol.iterator] !== 'function' || typeof keys.has !== 'function') {
    throw new TypeError('keys must be a Set-like iterable');
  }
  if (type === 'clear') return new Set();
  if (type !== 'keydown' && type !== 'keyup') throw new TypeError('unknown key transition');
  if (typeof code !== 'string' || code.length === 0) throw new TypeError('code is required');
  const next = new Set(keys);
  if (type === 'keydown') next.add(code);
  else next.delete(code);
  return next;
}

/**
 * Signed forward/strafe axes. Opposing inputs cancel; synonyms do not stack.
 * The KeyZ alias deliberately preserves the old prototype's mapping.
 */
export function movementAxes(keys) {
  if (!keys || typeof keys.has !== 'function') throw new TypeError('keys must support .has(code)');
  const forward = Number(anyPressed(keys, FWD)) - Number(anyPressed(keys, BACK));
  const horizontal = Number(anyPressed(keys, RIGHT)) - Number(anyPressed(keys, LEFT));
  return { forward, horizontal, moving: forward !== 0 || horizontal !== 0 };
}

/**
 * Return the desired planar displacement. No collision or world-time scaling:
 * player locomotion currently advances on real dt while enemies use world dt.
 */
export function movementStep(keys, yaw, dt, rules = PROTOTYPE_INPUT_RULES) {
  if (!Number.isFinite(yaw)) throw new RangeError('yaw must be finite');
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError('dt must be finite and nonnegative');
  const axes = movementAxes(keys);
  const sprinting = anyPressed(keys, SPRINT);
  const speed = sprinting ? rules.sprintSpeed : rules.walkSpeed;
  if (!Number.isFinite(speed)) throw new RangeError('movement speed must be finite');
  // PROVISIONAL WEB API: speed is a nonnegative magnitude, never a direction.
  // Check even while idle so malformed selected rules cannot escape unnoticed.
  if (speed < 0) throw new RangeError('movement speed must be nonnegative');
  if (!axes.moving) return { ...axes, sprinting, speed, dx: 0, dz: 0 };
  const inverse = 1 / Math.hypot(axes.forward, axes.horizontal);
  const sx = Math.sin(yaw) * axes.forward + Math.cos(yaw) * axes.horizontal;
  const sz = -Math.cos(yaw) * axes.forward + Math.sin(yaw) * axes.horizontal;
  const dx = sx * inverse * speed * dt;
  const dz = sz * inverse * speed * dt;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) {
    throw new RangeError('movement displacement must be finite');
  }
  return { ...axes, sprinting, speed, dx, dz };
}

/**
 * Classify key presses without changing a gameplay state or touching the DOM.
 * Escape during play is intentionally NOT a pause action: the current browser
 * code pauses after pointer-lock loss. `hop` is the existing jump gate.
 */
export function keydownAction({ code, screen = 'playing', repeat = false, hop = 0 } = {}) {
  if (repeat) return null;
  if (code === 'Enter' && (screen === 'menu' || screen === 'dead' || screen === 'win')) return 'start';
  if (screen === 'paused' && (code === 'Escape' || code === 'Enter')) return 'resume';
  if (screen !== 'playing') return null;
  if (code === 'KeyR') return 'reload';
  if (code === 'KeyF') return 'throw';
  if (code === 'KeyE') return 'pickup';
  if (code === 'Space' && hop < 0.02) return 'jump';
  return null;
}

/** Pointer button 0 fires, 2 throws; first click reacquires pointer lock. */
export function pointerAction({ button, screen = 'playing', pointerLocked = false } = {}) {
  if (screen !== 'playing' || (button !== 0 && button !== 2)) return null;
  if (!pointerLocked) return 'request-pointer-lock';
  return button === 0 ? 'shoot' : 'throw';
}

/** Browser lock-loss or tab-hidden pause decision, with no browser dependency. */
export function interruptionAction({ screen = 'playing', pointerLocked = true, visible = true } = {}) {
  return screen === 'playing' && (!pointerLocked || !visible) ? 'pause' : null;
}

/** Mouse sensitivity, pitch bounds and activity pulse of the old prototype. */
export function applyMouseLook({ yaw, pitch, movementX, movementY }, rules = PROTOTYPE_INPUT_RULES) {
  for (const [name, value] of Object.entries({yaw, pitch, movementX, movementY})) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  }
  // PROVISIONAL WEB input-rule invariants. Invalid caller rules must not
  // invert the pitch clamp, saturate activity through division by zero, or
  // return activity outside [0, 1]. These are NOT native MCD parameters.
  if (!Number.isFinite(rules.pitchLimit)) throw new RangeError('pitch must remain finite');
  if (rules.pitchLimit < 0) throw new RangeError('pitchLimit must be nonnegative');
  if (!Number.isFinite(rules.lookActivityDivisor)) throw new RangeError('lookActivity must remain finite');
  if (rules.lookActivityDivisor <= 0) throw new RangeError('lookActivityDivisor must be positive');
  if (!Number.isFinite(rules.minimumLookActivity)) throw new RangeError('lookActivity must remain finite');
  if (rules.minimumLookActivity < 0 || rules.minimumLookActivity > 1) {
    throw new RangeError('minimumLookActivity must be within [0, 1]');
  }
  const nextYaw = yaw + movementX * rules.mouseSensitivity;
  if (!Number.isFinite(nextYaw)) throw new RangeError('yaw must remain finite');
  const nextPitch = clamp(pitch - movementY * rules.mouseSensitivity, -rules.pitchLimit, rules.pitchLimit);
  const lookActivity = clamp(
    Math.hypot(movementX, movementY) / rules.lookActivityDivisor,
    rules.minimumLookActivity,
    1,
  );
  if (!Number.isFinite(nextPitch)) throw new RangeError('pitch must remain finite');
  if (!Number.isFinite(lookActivity)) throw new RangeError('lookActivity must remain finite');
  return { yaw: nextYaw, pitch: nextPitch, lookActivity };
}

/**
 * Delivered source-profile labels, NOT an active native input dispatcher.
 * PROUVÉ in KeyboardAndMouseProfile.cs:110-116,154-160 via private
 * corpus-query #65 (artifact 13135667172) and #64 (artifact 13136031484).
 * KeyCode names are Unity, not browser physical KeyboardEvent.code strings.
 * Actual profile selection, user rebinds, and screen-specific routing UNKNOWN.
 */
export const MCD_SOURCE_KEYBOARD_PROFILE = Object.freeze({
  'KeyCode.R': Object.freeze({ label: 'Replay', target: 'Back', rebindable: true }),
  'KeyCode.D': Object.freeze({ label: 'Move Right', target: 'LeftStickRight', rebindable: true }),
});

export function deliveredMcdKeyboardBinding(unityKeyCode) {
  return Object.hasOwn(MCD_SOURCE_KEYBOARD_PROFILE, unityKeyCode)
    ? MCD_SOURCE_KEYBOARD_PROFILE[unityKeyCode]
    : null;
}


/**
 * Source-qualified SHInputCamera input delta; opt-in and independent of the
 * existing PROVISIONAL WEB mouse/keyboard rules above.
 *
 * PROUVÉ for delivered MCD code, not runtime execution: PRIVATE research #107,
 * managed/Assembly-CSharp/InputSystem/SHInputCamera.cs:35-90, Steam build
 * 20299547, artifact 13143742282. Sensitivities are EFFECTIVE parameters
 * supplied by the caller, not unconditionally the serialized CameraLook
 * values. InputManager's device/cache selection and active Containers values
 * remain INCONNU. All input axes are InputDevice RightStick values, NOT DOM
 * MouseEvent.movementX/Y. Numeric restrictions are WEB API guards only.
 */
export function mcdSourcePadCurve(stick, deadzone, exponent) {
  if (![stick, deadzone, exponent].every(Number.isFinite)) {
    throw new RangeError('pad curve inputs must be finite');
  }
  if (deadzone < 0 || exponent <= 0) {
    throw new RangeError('pad curve requires a nonnegative deadzone and positive exponent');
  }
  if (Math.abs(stick) <= deadzone) return 0;
  // Crucially NOT pow(abs(stick) - deadzone, exponent): negative stick
  // uses abs(stick - deadzone), so the native curve is asymmetric.
  return Math.sign(stick) * Math.pow(Math.abs(stick - deadzone), exponent);
}

/**
 * Pure producer of native-camera *input deltas*, NOT yaw/pitch or radians.
 * `devices` includes every InputManager device; boolean device class and
 * active-device classification must be provided explicitly. Apply the
 * unscaled frame factor AFTER summing ALL devices when active is not mouse.
 * Pause/lock, slow-aim, original UI sensitivities, GetInput's Update cache,
 * and CameraLook.Update's pivot transforms are outside this contract.
 */
export function mcdSourceCameraInputDelta({
  devices,
  activeDeviceIsKeyboardMouse,
  mouseSensitivityX,
  mouseSensitivityY,
  gamepadSensitivityX,
  gamepadSensitivityY,
  deadzone,
  exponent,
  unscaledDeltaTime,
} = {}) {
  if (!Array.isArray(devices)) throw new TypeError('devices must be an explicit array');
  if (typeof activeDeviceIsKeyboardMouse !== 'boolean') {
    throw new TypeError('activeDeviceIsKeyboardMouse is required');
  }
  for (const [name, value] of Object.entries({
    mouseSensitivityX, mouseSensitivityY, gamepadSensitivityX,
    gamepadSensitivityY, deadzone, exponent, unscaledDeltaTime,
  })) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  }
  if (unscaledDeltaTime < 0) throw new RangeError('unscaledDeltaTime must be nonnegative');
  if (deadzone < 0 || exponent <= 0) throw new RangeError('invalid pad curve parameters');
  let x = 0;
  let y = 0;
  for (const device of devices) {
    if (typeof device?.isKeyboardMouse !== 'boolean') {
      throw new TypeError('device.isKeyboardMouse must be explicit');
    }
    const { rightStickX, rightStickY } = device;
    if (!Number.isFinite(rightStickX) || !Number.isFinite(rightStickY)) {
      throw new RangeError('device axes must be finite');
    }
    if (device.isKeyboardMouse) {
      x += rightStickX * mouseSensitivityX;
      y += rightStickY * mouseSensitivityY;
    } else {
      x += mcdSourcePadCurve(rightStickX, deadzone, exponent) * gamepadSensitivityX;
      y += mcdSourcePadCurve(rightStickY, deadzone, exponent) * gamepadSensitivityY;
    }
  }
  const scale = activeDeviceIsKeyboardMouse ? 1 : unscaledDeltaTime * 60;
  const result = { x: x * scale, y: y * scale };
  if (!Number.isFinite(result.x) || !Number.isFinite(result.y)) {
    throw new RangeError('camera input delta must be finite');
  }
  return result;
}
