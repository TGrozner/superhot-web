import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMcdGameplayClock, mcdSourcePlayerPreConstraintMove,
  sampleActiveFrameDeltas, stepMcdGameplayClock, stepWebMcdGameplayFrame,
} from '../src/time.js';

// Deterministic Web movement before collision resolution. This is NOT a
// browser smoke or a native MCD fixed-step scheduler.
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
    const tick = compensate
      ? stepWebMcdGameplayFrame(clock, {
        simulationDt, activeRealDt, maximumSteps: 4,
        x: 0, y: 1, grounded: true, yaw: 0, pitch: 0,
      })
      : stepMcdGameplayClock(clock, {
        dt: simulationDt, unscaledDt: activeRealDt,
        x: 0, y: 1, grounded: true, yaw: 0, pitch: 0,
      });
    lastSteps = compensate ? tick.worldSteps : [tick.worldDelta];
    if (compensate) {
      assert.ok(Math.abs(lastSteps.reduce((a, b) => a + b, 0) - tick.worldDelta) < 1e-8,
        'world slices MUST match the one world clock tick');
    }
    for (const scaledDeltaTime of lastSteps) {
      const move = mcdSourcePlayerPreConstraintMove({
        velocity: {x: 0, y: 0, z: 1},
        directionRotation: {x: 0, y: 0, z: 0, w: 1},
        scaledDeltaTime,
      });
      distance += move.z;
    }
  }
  return {distance, worldTime: clock.worldTime, realTime: clock.realTime, lastSteps};
};

test('Dojo 10/30/60 FPS low-FPS world steps and clock travel together', () => {
  const original10 = distanceForOneActiveSecond(10, false);
  assert.ok(Math.abs(original10.distance - 0.5) < 1e-5,
    'the previous 50ms cap loses half the player travel at 10 FPS');
  assert.ok(Math.abs(original10.worldTime - original10.distance) < 1e-5);

  for (const fps of [10, 30, 60]) {
    const result = distanceForOneActiveSecond(fps, true);
    assert.ok(Math.abs(result.distance - 1) < 1e-5, `${fps} FPS travel mismatch`);
    assert.ok(Math.abs(result.worldTime - 1) < 1e-5, `${fps} FPS world clock mismatch`);
    assert.ok(Math.abs(result.realTime - 1) < 1e-5, `${fps} FPS active real clock mismatch`);
    assert.ok(Math.abs(result.worldTime - result.distance) < 1e-5,
      `${fps} FPS simulation and world timers cannot diverge`);
  }
  const ten = distanceForOneActiveSecond(10, true);
  const sixty = distanceForOneActiveSecond(60, true);
  assert.equal(ten.lastSteps.length, 2, '100ms active produces two bounded 50ms steps');
  assert.ok(ten.lastSteps.every(step => step <= .050001));
  assert.equal(sixty.lastSteps.length, 1, '60 FPS retains one step');
});

test('bounded hitch, frozen world and pause never advance phantom world steps', () => {
  const clock = createMcdGameplayClock();
  clock.source.delayedUpdates = 0;
  clock.source.forcedTimeScale = 1;
  clock.timeScale = 1;
  const hitch = stepWebMcdGameplayFrame(clock, {
    simulationDt: .05, activeRealDt: .8, maximumSteps: 4, x: 0, y: 0,
  });
  assert.equal(hitch.worldSteps.length, 4);
  assert.ok(Math.abs(hitch.chargedActiveDt - .2) < 1e-8);
  assert.ok(Math.abs(hitch.discardedActiveDt - .6) < 1e-8);
  assert.ok(Math.abs(hitch.worldSteps.reduce((a, b) => a + b, 0) - clock.worldTime) < 1e-8);
  assert.ok(Math.abs(clock.worldTime - .2) < 1e-5);
  assert.ok(Math.abs(clock.realTime - .8) < 1e-5);

  const frozen = createMcdGameplayClock();
  frozen.timeScale = 0;
  const stoppedWorld = stepWebMcdGameplayFrame(frozen, {
    simulationDt: .05, activeRealDt: .1, maximumSteps: 4,
  });
  assert.deepEqual(stoppedWorld.worldSteps, [], 'no repeated zero-dt contacts');
  assert.equal(frozen.worldTime, 0);
  const before = frozen.realTime;
  const interrupted = stepWebMcdGameplayFrame(frozen, {
    simulationDt: 0, activeRealDt: 0, maximumSteps: 4, paused: true,
  });
  assert.deepEqual(interrupted.worldSteps, []);
  assert.equal(frozen.realTime, before);
  assert.throws(() => stepWebMcdGameplayFrame(frozen, {
    simulationDt: .05, activeRealDt: .1, maximumSteps: 0,
  }), RangeError);
  assert.throws(() => stepWebMcdGameplayFrame(frozen, {
    simulationDt: .051, activeRealDt: .1, maximumSteps: 4,
  }), /maximum collision step/);
});

test('Dojo collision slices expose world-clock boundaries before synthetic TTL expires', () => {
  const clock = createMcdGameplayClock();
  clock.source.delayedUpdates = 0;
  clock.source.forcedTimeScale = 1;
  clock.timeScale = 1;
  clock.worldTime = 4;
  const frameStart = clock.worldTime;
  const tick = stepWebMcdGameplayFrame(clock, {
    simulationDt: .05, activeRealDt: .1, maximumSteps: 4,
    x: 0, y: 1, grounded: true,
  });
  assert.equal(tick.worldSteps.length, 2);
  assert.equal(tick.worldStepOffsets.length, tick.worldSteps.length);
  let cumulative = 0;
  for (let index = 0; index < tick.worldSteps.length; index++) {
    cumulative += tick.worldSteps[index];
    assert.ok(Math.abs(tick.worldStepOffsets[index] - cumulative) < 1e-10,
      'each offset must represent its own completed collision slice');
  }
  // Synthetic TTL halfway between the two slices: it must NOT expire during
  // the first slice just because the pure clock already ticked once per RAF.
  const expiresAt = frameStart + .075;
  assert.ok(frameStart + tick.worldStepOffsets[0] < expiresAt);
  assert.ok(frameStart + tick.worldStepOffsets[1] >= expiresAt);
  assert.ok(Math.abs(frameStart + tick.worldStepOffsets.at(-1) - clock.worldTime) < 1e-8);
});


test('Dojo multi-slice AI never counts the same frame unscaled time twice', () => {
  // The real Dojo main.js passes activeRealDt as unscaledDeltaTime to both
  // encounter and gun-attack updates. A future per-slice hookup must pass
  // per-slice deltas, not the full frame duration on EVERY collision slice.
  for (const [activeRealDt, expectedSteps] of [[0.1, 2], [0.8, 4]]) {
    const clock = createMcdGameplayClock();
    clock.source.delayedUpdates = 0;
    clock.source.forcedTimeScale = 1;
    clock.timeScale = 1;
    const tick = stepWebMcdGameplayFrame(clock, {
      simulationDt: .05, activeRealDt, maximumSteps: 4,
    });
    assert.equal(tick.worldSteps.length, expectedSteps);
    assert.equal(tick.simulationStepDeltas.length, expectedSteps);
    assert.equal(tick.unscaledStepDeltas.length, expectedSteps);
    assert.ok(tick.unscaledStepDeltas.every(dt => dt >= 0 && Number.isFinite(dt)));
    const simulationTotal = tick.simulationStepDeltas.reduce((sum, dt) => sum + dt, 0);
    const unscaledTotal = tick.unscaledStepDeltas.reduce((sum, dt) => sum + dt, 0);
    assert.ok(Math.abs(simulationTotal - tick.chargedActiveDt) < 1e-10);
    assert.ok(Math.abs(unscaledTotal - activeRealDt) < 1e-10,
      'enemy unscaled time must advance only once per rendered frame');
    assert.ok(activeRealDt * expectedSteps > unscaledTotal,
      'reusing the full frame activeRealDt per slice would overcharge AI timers');
  }

  const clock = createMcdGameplayClock();
  const paused = stepWebMcdGameplayFrame(clock, {
    simulationDt: 0, activeRealDt: 0, maximumSteps: 4, paused: true,
  });
  assert.deepEqual(paused.simulationStepDeltas, []);
  assert.deepEqual(paused.unscaledStepDeltas, []);
});
