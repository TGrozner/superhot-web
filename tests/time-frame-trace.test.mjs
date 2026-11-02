import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeState, stepTime } from '../src/time.js';
import { applyMouseLook, movementAxes, movementStep } from '../src/input.js';

// Independent transcription of main@9f01f924's WEB prototype equations.
// This is an integration regression oracle, NOT a SUPERHOT MCD native oracle.
const almost = (actual, expected) => {
  assert.ok(Number.isFinite(actual), `non-finite output ${actual}`);
  assert.ok(Math.abs(actual - expected) <= 1e-10, `${actual} != ${expected}`);
};
const pressed = (keys, list) => list.some((key) => keys.has(key));

function oldWebTick(state, frame) {
  const keys = new Set(frame.keys);
  let yaw = state.yaw;
  let pitch = state.pitch;
  let lookActivity = state.lookActivity;
  let shotPulse = state.shotPulse;
  if (frame.mouse) {
    yaw += frame.mouse[0] * .00245;
    pitch = Math.max(-1.42, Math.min(1.42, pitch - frame.mouse[1] * .00245));
    lookActivity = Math.max(.12, Math.min(1, Math.hypot(...frame.mouse) / 34));
  }
  if (frame.shot) shotPulse = 1;
  if (frame.paused) return { ...state, yaw, pitch, lookActivity, shotPulse, dx: 0, dz: 0 };
  const dt = frame.dt;
  lookActivity = Math.max(0, lookActivity - dt * 2.1);
  shotPulse = Math.max(0, shotPulse - dt * 2.7);
  const fwd = Number(pressed(keys, ['KeyW','KeyZ','ArrowUp'])) - Number(pressed(keys, ['KeyS','ArrowDown']));
  const horizontal = Number(pressed(keys, ['KeyD','ArrowRight'])) - Number(pressed(keys, ['KeyA','ArrowLeft']));
  const moving = Math.hypot(fwd, horizontal) > 0;
  const wanted = Math.max(.035, moving ? .98 : 0, lookActivity * .77, shotPulse * .85, frame.reloading ? .60 : 0);
  const timeScale = state.timeScale + (wanted - state.timeScale) * (1 - Math.exp(-8 * dt));
  let dx = 0, dz = 0;
  if (moving) {
    const norm = 1 / Math.hypot(fwd, horizontal);
    const sx = Math.sin(yaw) * fwd + Math.cos(yaw) * horizontal;
    const sz = -Math.cos(yaw) * fwd + Math.sin(yaw) * horizontal;
    const velocity = pressed(keys, ['ShiftLeft','ShiftRight']) ? 8.9 : 6.7;
    dx = sx * norm * velocity * dt;
    dz = sz * norm * velocity * dt;
  }
  return {
    timeScale, lookActivity, shotPulse,
    realClock: state.realClock + dt,
    worldClock: state.worldClock + dt * timeScale,
    yaw, pitch, dx, dz,
  };
}

function pureWebTick(state, frame) {
  const keys = new Set(frame.keys);
  let yaw = state.yaw;
  let pitch = state.pitch;
  let lookActivity = state.lookActivity;
  let shotPulse = state.shotPulse;
  if (frame.mouse) {
    const look = applyMouseLook({ yaw, pitch, movementX: frame.mouse[0], movementY: frame.mouse[1] });
    ({ yaw, pitch, lookActivity } = look);
  }
  if (frame.shot) shotPulse = 1;
  const movement = movementAxes(keys);
  const time = stepTime(createTimeState({ ...state, lookActivity, shotPulse }), {
    dt: frame.dt, moving: movement.moving, reloading: Boolean(frame.reloading), paused: Boolean(frame.paused),
  });
  const displacement = frame.paused ? {dx:0,dz:0} : movementStep(keys, yaw, frame.dt);
  return { ...time, yaw, pitch, dx: displacement.dx, dz: displacement.dz };
}

test('SH-02 modules preserve a mixed keyboard/mouse/shoot/reload WEB-only frame trace', () => {
  const frames = [
    { dt: 1 / 60, keys: [] },
    { dt: .05, keys: ['KeyW','KeyZ','ArrowUp'], mouse: [27, -10] },
    { dt: .016, keys: ['KeyW','KeyD'], shot: true },
    { dt: .033, keys: ['KeyW','ShiftRight'], reloading: true },
    { dt: .008, keys: ['KeyS','KeyD'], mouse: [-92, 27] },
    { dt: .021, keys: ['KeyW','KeyS','KeyA','KeyD'], shot: true },
    { dt: 0, keys: ['ShiftLeft','KeyZ'], mouse: [0, 0] },
    { dt: .01, keys: ['ArrowDown','ArrowLeft'], reloading: true },
    { dt: .05, keys: [], mouse: [800, -800] },
    { dt: .05, keys: [], mouse: [0, 1000] },
    { dt: .03, keys: ['KeyW'], paused: true },
    { dt: 1 / 60, keys: ['KeyW'] },
  ];
  let expected = { ...createTimeState(), yaw: 0, pitch: 0 };
  let actual = { ...expected };
  for (const [index, frame] of frames.entries()) {
    expected = oldWebTick(expected, frame);
    actual = pureWebTick(actual, frame);
    for (const key of ['timeScale','lookActivity','shotPulse','realClock','worldClock','yaw','pitch','dx','dz']) {
      try { almost(actual[key], expected[key]); }
      catch (error) { error.message = `frame ${index} / ${key}: ${error.message}`; throw error; }
    }
  }
});
