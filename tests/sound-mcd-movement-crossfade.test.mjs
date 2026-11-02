import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialMcdMovementLayerState, stepMcdMovementLayer,
  computeMcdMovementLayerVolumes,
} from '../src/sound/mcd-movement-crossfade.js';

const sourceInitializerDurations = { toSlowDuration: 1, toFastDuration: 0.5 };
const sample = (changes = {}) => ({
  timeScale: 0.1, playerSpeed: 0, unscaledDeltaTime: 0.1,
  ...sourceInitializerDurations, ...changes,
});

test('native initial Update applies volumes even with progress zero', () => {
  const first = stepMcdMovementLayer(initialMcdMovementLayerState(), sample());
  assert.deepEqual(first, { progress: 0, lastProgress: 0, updateVolumes: true });
  assert.equal(stepMcdMovementLayer(first, sample()).updateVolumes, false);
});

test('timeScale below 0.1 fades slow via UNscaled delta regardless of velocity', () => {
  const state = { progress: 0.75, lastProgress: 0.75 };
  assert.deepEqual(stepMcdMovementLayer(state, sample({
    timeScale: 0.02, playerSpeed: 30, unscaledDeltaTime: 0.2,
  })), { progress: 0.55, lastProgress: 0.55, updateVolumes: true });
});

test('timeScale above 0.1 fades fast only while velocity magnitude > 0', () => {
  const state = { progress: 0.2, lastProgress: 0.2 };
  const moving = stepMcdMovementLayer(state, sample({
    timeScale: 0.101, playerSpeed: 0.001, unscaledDeltaTime: 0.1,
  }));
  assert.ok(Math.abs(moving.progress - 0.4) < 1e-12);
  assert.equal(moving.updateVolumes, true);
  const stopped = stepMcdMovementLayer(moving, sample({
    timeScale: 1, playerSpeed: 0, unscaledDeltaTime: 0.5,
  }));
  assert.equal(stopped.progress, moving.progress);
  assert.equal(stopped.updateVolumes, false);
});

test('exact timeScale 0.1 is a dead zone, including moving player', () => {
  const state = { progress: 0.6, lastProgress: 0.6 };
  assert.deepEqual(stepMcdMovementLayer(state, sample({
    timeScale: 0.1, playerSpeed: 5, unscaledDeltaTime: 0.3,
  })), { progress: 0.6, lastProgress: 0.6, updateVolumes: false });
});

test('MoveTowards cannot overshoot zero or one', () => {
  const low = stepMcdMovementLayer({ progress: 0.03, lastProgress: 0.03 }, sample({
    timeScale: 0.01, unscaledDeltaTime: 5,
  }));
  assert.equal(low.progress, 0);
  const high = stepMcdMovementLayer({ progress: 0.95, lastProgress: 0.95 }, sample({
    timeScale: 1, playerSpeed: 1, unscaledDeltaTime: 5,
  }));
  assert.equal(high.progress, 1);
});

test('each changer gets separate source-derived volume gains', () => {
  const fields = { slowMin: 0, slowMax: 0.8, fastMin: 0, fastMax: 0.6 };
  assert.deepEqual(computeMcdMovementLayerVolumes(0, fields), { fast: 0, slow: 0.8 });
  const middle = computeMcdMovementLayerVolumes(0.25, fields);
  assert.ok(Math.abs(middle.fast - 0.15) < 1e-12);
  assert.ok(Math.abs(middle.slow - 0.6) < 1e-12);
  assert.deepEqual(computeMcdMovementLayerVolumes(1, fields), { fast: 0.6, slow: 0 });
  assert.ok(Object.isFrozen(middle));
});

test('scene durations and per-changer volume bounds are required, never guessed', () => {
  assert.throws(() => stepMcdMovementLayer(initialMcdMovementLayerState(), sample({
    toFastDuration: undefined,
  })), /toFastDuration/);
  assert.throws(() => stepMcdMovementLayer(initialMcdMovementLayerState(), sample({
    toSlowDuration: 0,
  })), /toSlowDuration/);
  assert.throws(() => stepMcdMovementLayer(initialMcdMovementLayerState(), sample({
    unscaledDeltaTime: -1,
  })), /unscaledDeltaTime/);
  assert.throws(() => computeMcdMovementLayerVolumes(0.2, {
    slowMin: 0, slowMax: 0.8, fastMin: 0,
  }), /fastMax/);
});
