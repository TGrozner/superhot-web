import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMcdGameplayClock, sampleActiveFrameDeltas, stepMcdGameplayClock,
} from '../src/time.js';

// WEB gameplay fairness: this is NOT a trace of Unity/MCD's executed scheduler.
const runMovementForHalfSecond = (fps, passUnscaledDt) => {
  const clock = createMcdGameplayClock();
  // Avoid native TimeControl's two delayed writes obscuring the smoothing rate.
  clock.source.delayedUpdates = 0;
  let last = 1000;
  let firstWorldDelta = null;
  for (let i = 1; i <= fps / 2; i++) {
    const now = 1000 + i * 1000 / fps;
    const frame = sampleActiveFrameDeltas(last, now, 1000);
    const tick = stepMcdGameplayClock(clock, {
      dt: frame.simulationDt,
      ...(passUnscaledDt ? { unscaledDt: frame.activeRealDt } : {}),
      x: 0, y: 1, yaw: 0, pitch: 0,
    });
    if (firstWorldDelta === null) firstWorldDelta = tick.worldDelta;
    last = frame.nextTimestampMs;
  }
  return { clock, firstWorldDelta };
};

test('Dojo Web movement-time shifter responds in real elapsed time at 10/60 FPS', () => {
  const ten = runMovementForHalfSecond(10, true);
  const sixty = runMovementForHalfSecond(60, true);
  const legacyCapped = runMovementForHalfSecond(10, false);

  const tenModifier = ten.clock.source.shifters[0].currentTimeModifier;
  const sixtyModifier = sixty.clock.source.shifters[0].currentTimeModifier;
  const legacyModifier = legacyCapped.clock.source.shifters[0].currentTimeModifier;

  assert.ok(Math.abs(tenModifier - sixtyModifier) < 0.00001,
    `10 FPS movement ${tenModifier} vs 60 FPS ${sixtyModifier}`);
  assert.ok(Math.abs(tenModifier - 0.75) < 0.00001,
    '50 centiseconds of input should contribute about 0.75 movement modifier');
  assert.ok(legacyModifier < 0.4,
    'legacy physics-capped dt undercounted movement input by half at 10 FPS');

  assert.ok(Math.abs(ten.clock.realTime - 0.5) < 0.000001,
    'look sampling and input clock use active wall time, not capped physics time');
  assert.ok(Math.abs(sixty.clock.realTime - 0.5) < 0.000001);
  assert.ok(Math.abs(ten.firstWorldDelta - 0.05) < 0.000001,
    'first 10 FPS world step stays capped at 50 ms (old applied scale = 1)');
  assert.ok(Math.abs(sixty.firstWorldDelta - 1 / 60) < 0.000001);
  assert.ok(ten.clock.worldTime <= 0.25,
    'world/physics time retains the 50 ms cap at 10 FPS');
});

test('Dojo Web input-time override validates actual elapsed time without changing legacy callers', () => {
  for (const unscaledDt of [-0.001, NaN, Infinity]) {
    assert.throws(() => stepMcdGameplayClock(createMcdGameplayClock(), {
      dt: 0.05, unscaledDt,
    }), RangeError);
  }
  const oldCall = stepMcdGameplayClock(createMcdGameplayClock(), { dt: 0.05 });
  const explicitSame = stepMcdGameplayClock(createMcdGameplayClock(), {
    dt: 0.05, unscaledDt: 0.05,
  });
  assert.deepEqual(oldCall, explicitSame);
});
