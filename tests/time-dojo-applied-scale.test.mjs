import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMcdGameplayPulse,
  createMcdGameplayClock,
  stepMcdGameplayClock,
} from '../src/time.js';

const DT = 1 / 60;
const tick = (clock, input = {}) => stepMcdGameplayClock(clock, { dt: DT, ...input });
const settleIdle = clock => {
  for (let n = 0; n < 12; n++) tick(clock);
};

test('Dojo Web clock reports applied scale for this Update and next scale after LateUpdate', () => {
  const clock = createMcdGameplayClock();
  settleIdle(clock);
  const scaleBeforeUpdate = clock.timeScale;
  const movement = tick(clock, { y: 1 });

  assert.equal(scaleBeforeUpdate, Math.fround(0.005));
  assert.equal(movement.appliedTimeScale, scaleBeforeUpdate);
  assert.equal(movement.worldDelta, Math.fround(Math.fround(DT) * scaleBeforeUpdate));
  assert.equal(movement.timeScale, Math.fround(0.025));
  assert.notEqual(
    Math.fround(Math.fround(DT) * movement.timeScale), movement.worldDelta,
    'the newly written scale must not advance a hand/weapon animation in this tick',
  );
  const nextTick = tick(clock, { y: 1 });
  assert.equal(nextTick.appliedTimeScale, movement.timeScale);
  assert.equal(nextTick.worldDelta,
    Math.fround(Math.fround(DT) * movement.timeScale));
});

test('Dojo movement release decelerates on next tick, not this tick', () => {
  const clock = createMcdGameplayClock();
  settleIdle(clock);
  for (let n = 0; n < 48; n++) tick(clock, { y: 1 });
  assert.equal(clock.timeScale, 1);
  const released = tick(clock);
  assert.equal(released.appliedTimeScale, 1);
  assert.equal(released.worldDelta, Math.fround(DT));
  assert.equal(released.timeScale, 0.5);
  const decelerating = tick(clock);
  assert.equal(decelerating.appliedTimeScale, 0.5);
  assert.equal(decelerating.worldDelta, Math.fround(Math.fround(DT) * 0.5));
});

test('Dojo timed pulse has distinct current and future scales', () => {
  const clock = createMcdGameplayClock();
  settleIdle(clock);
  addMcdGameplayPulse(clock, 0.05, 0.5);
  const pulse = tick(clock);
  assert.equal(pulse.appliedTimeScale, Math.fround(0.005));
  assert.equal(pulse.timeScale, 0.5);
  assert.equal(pulse.worldDelta,
    Math.fround(Math.fround(DT) * pulse.appliedTimeScale));
  assert.equal(tick(clock).appliedTimeScale, 0.5);
});

test('paused Dojo frame applies zero world scale, preserving saved scale for resume', () => {
  const clock = createMcdGameplayClock();
  settleIdle(clock);
  const before = { scale: clock.timeScale, worldTime: clock.worldTime };
  const frozen = tick(clock, { dt: 10, paused: true, y: 1 });
  assert.equal(frozen.appliedTimeScale, 0);
  assert.equal(frozen.timeScale, 0);
  assert.equal(frozen.worldDelta, 0);
  assert.equal(clock.timeScale, before.scale);
  assert.equal(clock.worldTime, before.worldTime);
  assert.equal(tick(clock).appliedTimeScale, before.scale);
});
