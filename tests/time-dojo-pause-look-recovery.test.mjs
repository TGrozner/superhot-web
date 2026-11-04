import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMcdGameplayClock, stepMcdGameplayClock, addMcdGameplayPulse,
  MCD_SOURCE_TIME_CONSTANTS, WEB_LOOK_ANGLE_CAP,
} from '../src/time.js';

// WEB comfort regression: pausing mid-flick should not replay old pointer
// activity on resume. This does NOT model Unity pause or a native input event.
const tick = (clock, lookPathDegrees = 0) => stepMcdGameplayClock(clock, {
  dt: 1 / 60, unscaledDt: 1 / 60, x: 0, y: 0, yaw: 0, pitch: 0, lookPathDegrees,
});

test('Dojo pause clears stale look acceleration without discarding live non-look modifiers', () => {
  const clock = createMcdGameplayClock();
  clock.source.delayedUpdates = 0;
  assert.equal(tick(clock, WEB_LOOK_ANGLE_CAP).timeScale, Math.fround(0.3));
  const pausedAt = clock.realTime;
  const paused = stepMcdGameplayClock(clock, {
    dt: 0, unscaledDt: 0, paused: true, yaw: 0, pitch: 0,
  });
  assert.equal(paused.worldDelta, 0);
  assert.equal(paused.appliedTimeScale, 0);
  assert.equal(clock.realTime, pausedAt, 'paused gameplay must not advance the input clock');
  assert.equal(clock.source.shifters[2].currentTimeModifier, 0);
  assert.equal(clock.timeScale, MCD_SOURCE_TIME_CONSTANTS.minimumTimescale);
  const resumed = tick(clock);
  assert.equal(resumed.appliedTimeScale, MCD_SOURCE_TIME_CONSTANTS.minimumTimescale,
    'a fresh stationary frame must not replay the pre-pause look pulse');
  assert.equal(resumed.timeScale, MCD_SOURCE_TIME_CONSTANTS.minimumTimescale);

  const withPulse = createMcdGameplayClock();
  withPulse.source.delayedUpdates = 0;
  addMcdGameplayPulse(withPulse, 1, 0.5);
  assert.equal(tick(withPulse, WEB_LOOK_ANGLE_CAP).timeScale, Math.fround(0.5));
  stepMcdGameplayClock(withPulse, { dt: 0, unscaledDt: 0, paused: true });
  assert.equal(withPulse.timeScale, Math.fround(0.5),
    'interrupting a Web camera pulse must not discard an unrelated registered time pulse');
  assert.equal(tick(withPulse).appliedTimeScale, Math.fround(0.5));
});
