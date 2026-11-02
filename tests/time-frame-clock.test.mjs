import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOTYPE_FRAME_RULES, createTimeState, sampleFrameDelta, stepTime,
} from '../src/time.js';

const near = (actual, expected, tolerance = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('Web requestAnimationFrame delta is in seconds and capped at 50 ms', () => {
  assert.equal(PROTOTYPE_FRAME_RULES.maximumDeltaSeconds, .05);
  const normal = sampleFrameDelta(1000, 1016.5);
  near(normal.dt, .0165);
  assert.equal(normal.nextTimestampMs, 1016.5);
  const longGap = sampleFrameDelta(normal.nextTimestampMs, 8016.5);
  assert.deepEqual(longGap, { dt: .05, nextTimestampMs: 8016.5 });
  const resumed = sampleFrameDelta(longGap.nextTimestampMs, 8033.5);
  near(resumed.dt, .017);
});

test('zero and backwards timestamps re-anchor without negative world steps', () => {
  assert.deepEqual(sampleFrameDelta(12, 12), { dt: 0, nextTimestampMs: 12 });
  const backwards = sampleFrameDelta(300, 200);
  assert.deepEqual(backwards, { dt: 0, nextTimestampMs: 200 });
  near(sampleFrameDelta(backwards.nextTimestampMs, 201).dt, .001);
});

test('pause samples frames but does not accumulate a deferred catch-up', () => {
  const initial = createTimeState();
  const stalled = sampleFrameDelta(1000, 51000);
  const paused = stepTime(initial, { dt: stalled.dt, paused: true, moving: true });
  assert.equal(paused.realClock, 0);
  assert.equal(paused.worldClock, 0);
  assert.equal(paused.timeScale, initial.timeScale);
  const next = sampleFrameDelta(stalled.nextTimestampMs, 51016);
  near(next.dt, .016);
  const played = stepTime(paused, { dt: next.dt, moving: true });
  near(played.realClock, .016);
  near(played.worldDelta, played.realDelta * played.timeScale);
});

test('timestamp validation refuses non-finite frame input without DOM dependencies', () => {
  for (const value of [undefined, NaN, Infinity, -Infinity, '100']) {
    assert.throws(() => sampleFrameDelta(value, 100), RangeError);
    assert.throws(() => sampleFrameDelta(100, value), RangeError);
  }
});
