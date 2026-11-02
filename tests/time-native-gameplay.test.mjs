import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcdGameplayClock, stepMcdGameplayClock, addMcdGameplayPulse } from '../src/time.js';

const tick = (clock, input = {}) => stepMcdGameplayClock(clock, { dt: 1 / 60, ...input });
const settle = clock => { for (let i = 0; i < 12; i++) tick(clock); };

test('native gameplay uses the previous scale for movement and source linear rise/fall for the next frame', () => {
  const clock = createMcdGameplayClock();
  settle(clock);
  const idle = tick(clock);
  assert.equal(idle.timeScale, Math.fround(.005));
  const first = tick(clock, { y: 1 });
  assert.equal(first.worldDelta, idle.worldDelta, 'new input must not retroactively accelerate this Update');
  assert.equal(first.timeScale, Math.fround(.025));
  for (let i = 0; i < 45; i++) tick(clock, { y: 1 });
  assert.equal(clock.timeScale, 1);
  const release = tick(clock);
  assert.equal(release.worldDelta, Math.fround(1 / 60));
  assert.equal(release.timeScale, .5);
  assert.equal(tick(clock).timeScale, Math.fround(.005));
});

test('action pulses expire on world time, survive pause, and do not sum with locomotion', () => {
  const clock = createMcdGameplayClock();
  settle(clock);
  addMcdGameplayPulse(clock, .05, .2);
  addMcdGameplayPulse(clock, .05, .5);
  assert.equal(tick(clock).timeScale, .5, 'registry selects max, not sum');
  const before = clock.worldTime;
  const paused = tick(clock, { dt: 60, paused: true, y: 1 });
  assert.equal(paused.worldDelta, 0);
  assert.equal(paused.timeScale, 0);
  assert.equal(clock.worldTime, before);
  assert.equal(tick(clock).timeScale, .5, 'wall-clock pause does not expire a game-clock pulse');
  for (let i = 0; i < 20; i++) tick(clock);
  assert.equal(clock.timeScale, Math.fround(.005));
});

test('airborne contribution and measured camera rotation feed separate bounded shifters', () => {
  const clock = createMcdGameplayClock();
  settle(clock);
  assert.equal(tick(clock, { grounded: false }).timeScale, Math.fround(.375));
  assert.equal(tick(clock, { grounded: false }).timeScale, Math.fround(.75));
  tick(clock);
  const look = tick(clock, { dt: .02, yaw: Math.PI / 6 });
  assert.equal(look.timeScale, Math.fround(.3));
  const buffered = tick(clock, { dt: .02, yaw: Math.PI / 6 });
  assert.equal(buffered.timeScale, Math.fround(.3), 'remaining rotation contribution is consumed, not discarded');
  for (let i = 0; i < 10; i++) tick(clock, { dt: .02, yaw: Math.PI / 6 });
  assert.equal(clock.timeScale, Math.fround(.005));
});
