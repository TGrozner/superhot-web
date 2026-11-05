import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMcdGameplayClock, stepMcdGameplayClock, WEB_LOOK_ANGLE_CAP,
} from '../src/time.js';

// WEB-only low-FPS feel: unscaled elapsed time must not stretch a leftover
// camera pulse. This does not model native MCD scheduling or graphics.
const step = (clock, wallDt, degrees = 0) => stepMcdGameplayClock(clock, {
  dt: Math.min(0.05, wallDt), unscaledDt: wallDt,
  x: 0, y: 0, yaw: 0, pitch: 0, lookPathDegrees: degrees,
});

test('Dojo camera time recovers after real elapsed time, not extra low-FPS frames', () => {
  const ten = createMcdGameplayClock();
  ten.source.delayedUpdates = 0;
  assert.equal(step(ten, 0.1, WEB_LOOK_ANGLE_CAP).timeScale, Math.fround(0.3));
  assert.equal(step(ten, 0.1).timeScale, Math.fround(0.005),
    'a 100ms empty frame must expire the residual look pulse');

  const sixty = createMcdGameplayClock();
  sixty.source.delayedUpdates = 0;
  assert.equal(step(sixty, 1 / 60, WEB_LOOK_ANGLE_CAP).timeScale, Math.fround(0.3));
  assert.equal(step(sixty, 1 / 60).timeScale, Math.fround(0.3),
    'existing ~17ms second pulse is preserved at 60 FPS');
  assert.equal(step(sixty, 1 / 60).timeScale, Math.fround(0.005));
});

test('startup rotation survives both delayed TimeControl writes even at 10 FPS', () => {
  const clock = createMcdGameplayClock();
  const first = step(clock, 0.1, WEB_LOOK_ANGLE_CAP);
  const second = step(clock, 0.1);
  const firstWritable = step(clock, 0.1);
  const recovered = step(clock, 0.1);
  assert.equal(first.timeScale, 1);
  assert.equal(second.timeScale, 1);
  assert.equal(firstWritable.timeScale, Math.fround(0.3),
    'never expire a queued START/REJOUER flick before its first writable tick');
  assert.equal(recovered.timeScale, Math.fround(0.005),
    'after first delivery an idle 100ms frame must recover slow motion');
});
