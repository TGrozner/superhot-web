import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MCD_SOURCE_PLAYER_TIME_SHIFTERS,
  advanceMcdSourceLinearShifter,
  mcdSourcePlayerTimeTargets,
  createMcdSourceTimeState,
  advanceMcdSourceTime,
} from '../src/time.js';

const movement = MCD_SOURCE_PLAYER_TIME_SHIFTERS.movement;
const jump = MCD_SOURCE_PLAYER_TIME_SHIFTERS.jump;

const apply = (currentTimeModifier, targetTimeModifier, rates, unscaledDeltaTime) =>
  advanceMcdSourceLinearShifter({
    currentTimeModifier, targetTimeModifier, ...rates, unscaledDeltaTime,
  });

const targets = (overrides = {}) => mcdSourcePlayerTimeTargets({
  processedX: 0, processedY: 0, isGrounded: true,
  cameraDollyMode: false, powerActive: false,
  canAlterTimescale: true, ...overrides,
});

test('MCD source registration distinguishes movement and jump shifter rates', () => {
  assert.equal(movement.inSmoothing, Math.fround(0.025));
  assert.equal(movement.outSmoothing, Math.fround(0.5));
  assert.equal(jump.inSmoothing, Math.fround(0.5));
  assert.equal(jump.outSmoothing, Math.fround(0.9));
});

test('rising movement contribution uses unscaled seconds and target-weighted slope', () => {
  const first = apply(0, 1, movement, 1 / 60);
  assert.equal(first, Math.fround(Math.fround(0.025) * Math.fround(Math.fround(1 / 60) * 60)));
  const halfStep = apply(0, 1, movement, 1 / 120);
  assert.equal(halfStep, Math.fround(Math.fround(0.025) * Math.fround(Math.fround(1 / 120) * 60)));
  assert.ok(Math.abs(first - 2 * halfStep) < 1e-8);
  assert.equal(apply(0, 0.2, movement, 1 / 60),
    Math.fround(Math.fround(Math.fround(0.025) * Math.fround(0.2)) * Math.fround(Math.fround(1 / 60) * 60)));
});

test('rise clamps at target; fall is independent of target magnitude and floors at target', () => {
  assert.equal(apply(0, 0.3, jump, 1 / 10), Math.fround(0.3));
  assert.equal(apply(0.8, 0, movement, 1 / 120),
    Math.fround(Math.fround(0.8) - Math.fround(Math.fround(0.5) * Math.fround(Math.fround(1 / 120) * 60))));
  assert.equal(apply(0.8, 0.6, movement, 1 / 60), Math.fround(0.6));
  assert.equal(apply(0.8, 0.6, movement, 0), Math.fround(0.8));
});

test('target calculation clamps input magnitude and halves it for dolly', () => {
  assert.deepEqual(targets({ processedX: 1, processedY: 1 }), {
    writes: true, movementTarget: 1, jumpTarget: 0,
  });
  assert.deepEqual(targets({ processedX: 1, processedY: 1, cameraDollyMode: true }), {
    writes: true, movementTarget: 0.5, jumpTarget: 0,
  });
});

test('POWER and airborne context independently influence movement and jump shifter targets', () => {
  assert.deepEqual(targets({ processedX: 1, isGrounded: false, powerActive: true }), {
    writes: true, movementTarget: Math.fround(0.2),
    jumpTarget: Math.fround(Math.fround(0.75) * Math.fround(0.2)),
  });
  assert.deepEqual(targets({ isGrounded: false }), {
    writes: true, movementTarget: 0, jumpTarget: Math.fround(0.75),
  });
});

test('disabled canAlterTimescale means no setter call, not a reset to zero', () => {
  assert.deepEqual(targets({ processedX: 1, isGrounded: false, canAlterTimescale: false }), {
    writes: false, movementTarget: null, jumpTarget: null,
  });
});

test('opt-in source adapter requires explicit context and independently supplied unscaled dt', () => {
  assert.throws(() => mcdSourcePlayerTimeTargets({ processedX: 0, processedY: 1 }), /explicitly supplied/);
  assert.throws(() => apply(0, 1, movement, -0.1), /nonnegative/);
  assert.throws(() => apply(0, 1, movement, Number.NaN), /finite/);
  const previous = { currentTimeModifier: 0.1, targetTimeModifier: 1, ...movement, unscaledDeltaTime: 1 / 60 };
  advanceMcdSourceLinearShifter(previous);
  assert.equal(previous.currentTimeModifier, 0.1);
});

test('synthetic frame contributes movement and airborne jump to source max then override zero', () => {
  // This is an explicitly supplied frame snapshot, NOT a measured Containers tick.
  const context = targets({ processedX: 1, processedY: 0, isGrounded: false });
  const movementModifier = apply(0, context.movementTarget, movement, 1 / 60);
  const jumpModifier = apply(0, context.jumpTarget, jump, 1 / 60);
  assert.equal(movementModifier, Math.fround(0.025));
  assert.equal(jumpModifier, Math.fround(0.375));
  const base = createMcdSourceTimeState({ fixedTimestepDenominator: 120, powerActive: false });
  assert.equal(base.fixedDeltaTime, Math.fround(1 / Math.fround(120)));
  const ready = {
    ...base, delayedUpdates: 0,
    shifters: [
      { terminated: false, currentTimeModifier: movementModifier },
      { terminated: false, currentTimeModifier: jumpModifier },
    ],
  };
  const active = advanceMcdSourceTime(ready);
  assert.equal(active.aggregate, jumpModifier);
  assert.equal(active.timeScale, jumpModifier);
  const forced = advanceMcdSourceTime({ ...ready, forcedTimeScale: 0 });
  assert.equal(forced.aggregate, jumpModifier);
  assert.equal(forced.timeScale, 0);
});
