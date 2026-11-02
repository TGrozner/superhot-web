/**
 * Pure, browser-independent input interpretation for FRAME//BREAK.
 * PROVENANCE: superhot-web/src/main.js at 9f01f92411b4e125b2c992deee53602a8c67c416.
 * STATUS: PROVISIONAL Web behavior, NOT verified SUPERHOT MCD parity.
 *
 * Browser event listeners, focus and pointer-lock acquisition are intentionally
 * not executed here. `KeyboardEvent.code` values are physical-key codes.
 * Web-only numeric guards reject overflowing or malformed rule outputs without changing
 * the prototype's movement or camera coefficients.
 * SH-01's secondary MCD research handoff reports R = Replay (not reload);
 * its active input dispatcher still needs primary verification. `KeyR` below
 * deliberately retains the WEB PROTOTYPE's reload key until that contract is
 * proved. Do not infer native input semantics from these helpers.
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
