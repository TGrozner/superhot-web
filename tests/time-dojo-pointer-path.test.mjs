import test from 'node:test';
import assert from 'node:assert/strict';
import { accumulateWebPointerLookPath } from '../src/input.js';
import {
  WEB_LOOK_ANGLE_CAP, createMcdGameplayClock, stepMcdGameplayClock,
} from '../src/time.js';

// WEB gameplay regression only: no MCD native event/cadence claim.
// The browser may dispatch multiple mousemove events before a single RAF tick.
test('Dojo look-time counts opposing mouse events inside one render frame', () => {
  let path = 0;
  path = accumulateWebPointerLookPath(path, {
    previousYaw: 0, previousPitch: 0, yaw: 0.25, pitch: 0,
  });
  path = accumulateWebPointerLookPath(path, {
    previousYaw: 0.25, previousPitch: 0, yaw: 0, pitch: 0,
  });
  assert.equal(path, WEB_LOOK_ANGLE_CAP,
    'the path retains both applied turns even though the final yaw matches');

  const legacy = createMcdGameplayClock();
  legacy.source.delayedUpdates = 0;
  const missed = stepMcdGameplayClock(legacy, {
    dt: 1 / 60, yaw: 0, pitch: 0,
  });
  assert.equal(missed.timeScale, Math.fround(0.005),
    'the old once-per-frame pose comparison cannot see same-frame reversal');

  const withEvents = createMcdGameplayClock();
  withEvents.source.delayedUpdates = 0;
  const first = stepMcdGameplayClock(withEvents, {
    dt: 1 / 60, yaw: 0, pitch: 0, lookPathDegrees: path,
  });
  assert.equal(first.appliedTimeScale, 1,
    'the current frame must still consume the previously applied timescale');
  assert.equal(first.timeScale, Math.fround(0.3),
    'the next world tick reacts to the actual input events');

  const second = stepMcdGameplayClock(withEvents, {
    dt: 1 / 60, yaw: 0, pitch: 0, lookPathDegrees: 0,
  });
  assert.equal(second.timeScale, Math.fround(0.3),
    'existing two-sample comfort cap is unchanged');
  const third = stepMcdGameplayClock(withEvents, {
    dt: 1 / 60, yaw: 0, pitch: 0, lookPathDegrees: 0,
  });
  assert.equal(third.timeScale, Math.fround(0.005),
    'the camera must return to slow motion after the brief pulse');

  assert.equal(accumulateWebPointerLookPath(0, {
    previousYaw: 0, previousPitch: 80 * Math.PI / 180,
    yaw: 0, pitch: 80 * Math.PI / 180,
  }), 0, 'a mouse movement rejected by the pitch clamp adds no fictitious pulse');
});
