import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMcdGameplayClock,
  createMcdSourceLookTimeshiftState,
  stepMcdGameplayClock,
} from '../src/time.js';

// Source method: private research #148, artifact 13175262864. This is a
// synthetic Web integration frame, NOT an observed native Dojo camera sample.
test('Dojo clock routes explicitly verified source-look samples into scaled world time without changing fallback', () => {
  const identity = { x: 0, y: 0, z: 0, w: 1 };
  const rotated = { x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) };
  const clock = createMcdGameplayClock();
  clock.source.delayedUpdates = 0; // test a live tick after initial source delay
  let state = {
    ...createMcdSourceLookTimeshiftState({
      cameraWorldRotation: identity, currentTimeModifier: 0,
    }),
    warmupUpdatesRemaining: 0, // test after the source Start warmup
  };
  const explicitGates = {
    wydmuszkaMode: false,
    activeWeaponIsTakedown: false,
    takedownCanUseTimeshifts: false,
    lockLookShifter: false,
  };
  const first = stepMcdGameplayClock(clock, {
    dt: 0.05, yaw: 0, pitch: 0,
    sourceLookSample: { state, cameraWorldRotation: rotated, unscaledTime: 1, ...explicitGates },
  });
  assert.equal(first.lookSourceResult.measured, true);
  assert.equal(first.lookSourceResult.wroteModifier, true);
  assert.equal(clock.source.shifters[2].currentTimeModifier, Math.fround(0.3));
  assert.equal(first.appliedTimeScale, 1);
  assert.equal(first.timeScale, Math.fround(0.3));
  state = first.lookSourceResult.state;
  const second = stepMcdGameplayClock(clock, {
    dt: 0.05, yaw: 0, pitch: 0,
    sourceLookSample: { state, cameraWorldRotation: rotated, unscaledTime: 1.1, ...explicitGates },
  });
  assert.equal(second.appliedTimeScale, Math.fround(0.3));
  assert.equal(second.worldDelta, Math.fround(Math.fround(0.05) * Math.fround(0.3)));
  const fallback = stepMcdGameplayClock(createMcdGameplayClock(), { dt: 0.05, yaw: 0, pitch: 0 });
  assert.equal(Object.hasOwn(fallback, 'lookSourceResult'), false);
  assert.equal(fallback.appliedTimeScale, 1);
  assert.throws(() => stepMcdGameplayClock(createMcdGameplayClock(), {
    dt: 0.05, sourceLookSample: { state, cameraWorldRotation: rotated, unscaledTime: 2 },
  }), /explicit boolean/);
});
