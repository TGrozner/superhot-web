import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcdGameplayClock, stepMcdGameplayClock } from '../src/time.js';

const tick = (clock, yaw) => stepMcdGameplayClock(clock, {
  dt: 0.02, x: 0, y: 0, grounded: true, yaw, pitch: 0,
});

// Web gameplay regression, not a claim about native startup ordering:
// the old lookWarmup discarded the first 10 frames of real mouse rotation.
// The source-qualified TimeControl adapter deliberately delays its first
// two writes, so the playable Web fallback must not spend the entire pulse
// before any write is possible.
test('Dojo opening and replay turns affect the first writable world-time tick', () => {
  for (const run of ['opening', 'replay']) {
    const clock = createMcdGameplayClock({ yaw: 0, pitch: 0 });
    const turn = tick(clock, Math.PI);
    assert.equal(turn.timeScale, 1, `${run}: source clock still defers its first write`);
    assert.equal(clock.lookBuffer, Math.fround(0.6),
      `${run}: the actual opening flick must survive the deferred write`);

    const preWrite = tick(clock, Math.PI);
    assert.equal(preWrite.timeScale, 1);
    assert.equal(clock.lookBuffer, Math.fround(0.6),
      `${run}: no look pulse is lost while a timescale write is impossible`);

    const firstWritable = tick(clock, Math.PI);
    assert.equal(firstWritable.appliedTimeScale, 1);
    assert.equal(firstWritable.timeScale, Math.fround(0.3),
      `${run}: the first writable frame receives the opening turn`);

    const release = tick(clock, Math.PI);
    assert.equal(release.appliedTimeScale, Math.fround(0.3));
    assert.equal(release.timeScale, Math.fround(0.3));
    assert.equal(tick(clock, Math.PI).timeScale, Math.fround(0.005),
      `${run}: stationary aiming returns promptly to the slow Web idle scale`);
  }
});
