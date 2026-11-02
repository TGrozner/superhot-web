import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeState, stepTime } from '../src/time.js';
import { applyMouseLook, movementStep } from '../src/input.js';

// These are WEB prototype safety guards, not native MCD timing/input evidence.
// SH-01 #25 still requires active Unity bindings and measured native traces.

test('finite time inputs cannot overflow the real clock silently', () => {
  const before = createTimeState({ realClock: Number.MAX_VALUE });
  assert.throws(
    () => stepTime(before, { dt: Number.MAX_VALUE, moving: true }),
    { name: 'RangeError', message: /next realClock must be finite/ },
  );
  assert.equal(before.realClock, Number.MAX_VALUE, 'failed step must not mutate its input');
});

test('finite time inputs cannot overflow the world clock silently', () => {
  const before = createTimeState({ worldClock: Number.MAX_VALUE });
  assert.throws(
    () => stepTime(before, { dt: Number.MAX_VALUE, moving: true }),
    { name: 'RangeError', message: /next worldClock must be finite/ },
  );
  assert.equal(before.worldClock, Number.MAX_VALUE);
});

test('paused time still freezes valid, extremely large clocks without advancing them', () => {
  const before = createTimeState({ realClock: Number.MAX_VALUE, worldClock: Number.MAX_VALUE });
  const after = stepTime(before, { dt: Number.MAX_VALUE, paused: true });
  assert.equal(after.realClock, before.realClock);
  assert.equal(after.worldClock, before.worldClock);
  assert.equal(after.realDelta, 0);
  assert.equal(after.worldDelta, 0);
});

test('finite inputs cannot produce infinite Web movement displacement', () => {
  const held = new Set(['KeyW']);
  assert.throws(
    () => movementStep(held, 0, Number.MAX_VALUE),
    { name: 'RangeError', message: /movement displacement must be finite/ },
  );
  const ordinary = movementStep(held, 0, 1 / 60);
  assert.equal(ordinary.dx, 0);
  assert.ok(Number.isFinite(ordinary.dz) && ordinary.dz < 0);
});

test('finite inputs cannot produce an infinite Web yaw', () => {
  assert.throws(
    () => applyMouseLook({
      yaw: Number.MAX_VALUE, pitch: 0,
      movementX: Number.MAX_VALUE, movementY: 0,
    }),
    { name: 'RangeError', message: /yaw must remain finite/ },
  );
  const ordinary = applyMouseLook({ yaw: 0, pitch: 0, movementX: 20, movementY: -5 });
  assert.equal(ordinary.yaw, 20 * .00245);
  assert.ok(Number.isFinite(ordinary.pitch));
});
