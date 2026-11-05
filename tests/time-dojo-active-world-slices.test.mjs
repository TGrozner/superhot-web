import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMcdGameplayClock, mcdSourcePlayerPreConstraintMove,
  sampleActiveFrameDeltas, splitWebActiveWorldFrame, stepMcdGameplayClock,
} from '../src/time.js';

// Web-only, deterministic frame-spacing reproduction of the live call path.
// The displacement is pre-constraint: no claim of measured browser collisions.
const distanceForOneActiveSecond = (fps, compensate) => {
  const clock = createMcdGameplayClock();
  clock.source.delayedUpdates = 0;
  clock.source.forcedTimeScale = 1;
  clock.timeScale = 1;
  let previous = 1000;
  let distance = 0;
  let lastSteps = [];
  for (let index = 1; index <= fps; index++) {
    const now = 1000 + index * 1000 / fps;
    const {simulationDt, activeRealDt, nextTimestampMs} =
      sampleActiveFrameDeltas(previous, now, 1000);
    previous = nextTimestampMs;
    const tick = stepMcdGameplayClock(clock, {
      dt: simulationDt, unscaledDt: activeRealDt, x: 0, y: 1,
      grounded: true, yaw: 0, pitch: 0,
    });
    lastSteps = compensate
      ? splitWebActiveWorldFrame({
        simulationDt, activeRealDt, worldDelta: tick.worldDelta, maximumSteps: 4,
      }).worldSteps
      : [tick.worldDelta];
    for (const scaledDeltaTime of lastSteps) {
      const move = mcdSourcePlayerPreConstraintMove({
        velocity: {x: 0, y: 0, z: 1},
        directionRotation: {x: 0, y: 0, z: 0, w: 1},
        scaledDeltaTime,
      });
      distance += move.z;
    }
  }
  return {distance, lastSteps};
};

test('Dojo Web active motion slices conserve 10/30/60 FPS travel without an oversized collision step', () => {
  const original10 = distanceForOneActiveSecond(10, false);
  const ten = distanceForOneActiveSecond(10, true);
  const thirty = distanceForOneActiveSecond(30, true);
  const sixty = distanceForOneActiveSecond(60, true);
  assert.ok(Math.abs(original10.distance - 0.5) < 1e-5,
    'the existing 50ms capped player movement loses half a second at 10 FPS');
  for (const [fps, result] of [[10, ten], [30, thirty], [60, sixty]]) {
    assert.ok(Math.abs(result.distance - 1) < 1e-5,
      `${fps} FPS should traverse one world-time unit at constant applied scale`);
  }
  assert.equal(ten.lastSteps.length, 2, 'a 100ms active frame needs two <=50ms world steps');
  assert.ok(ten.lastSteps.every((slice) => slice <= 0.050001));
  assert.equal(sixty.lastSteps.length, 1, '60 FPS must keep its original single step');

  // A long hitch is intentionally bounded; no uncontrolled collision catch-up.
  const hitch = splitWebActiveWorldFrame({
    simulationDt: 0.05, activeRealDt: 0.8, worldDelta: 0.01, maximumSteps: 4,
  });
  assert.equal(hitch.worldSteps.length, 4);
  assert.ok(Math.abs(hitch.worldSteps.reduce((a, b) => a + b, 0) - 0.04) < 1e-10);
  assert.ok(Math.abs(hitch.discardedActiveDt - 0.6) < 1e-10);

  const interrupted = splitWebActiveWorldFrame({
    simulationDt: 0, activeRealDt: 0, worldDelta: 0, maximumSteps: 4,
  });
  assert.deepEqual(interrupted.worldSteps, []);
  const stoppedWorld = splitWebActiveWorldFrame({
    simulationDt: 0.05, activeRealDt: 0.1, worldDelta: 0, maximumSteps: 4,
  });
  assert.deepEqual(stoppedWorld, {
    worldSteps: [], chargedActiveDt: 0, discardedActiveDt: 0.1,
  }, 'forced zero-scale world must not dispatch repeated zero-dt callbacks');
  assert.throws(() => splitWebActiveWorldFrame({
    simulationDt: 0.05, activeRealDt: 0.1, worldDelta: 0.05, maximumSteps: 0,
  }), RangeError);
});
