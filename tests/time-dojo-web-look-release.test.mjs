import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcdGameplayClock, stepMcdGameplayClock } from '../src/time.js';

const dt = 0.02;
const advance = (clock, yaw = 0) => stepMcdGameplayClock(clock, {
  dt, yaw, pitch: 0, x: 0, y: 0, grounded: true,
});

// Regression: the playable Web Dojo used to keep look-time at .3 for ~18
// measurements after a single 180-degree mouse flick (buffer ≈ 5.4).
// Two measurements of tail are a creative Web comfort rule, NOT MCD parity.
test('Dojo Web fast turn accelerates immediately, then releases after one buffered sample', () => {
  const clock = createMcdGameplayClock();
  for (let i = 0; i < 12; i++) advance(clock);

  const turn = advance(clock, Math.PI);
  assert.equal(turn.timeScale, Math.fround(0.3));
  assert.equal(clock.lookBuffer, Math.fround(0.3));
  assert.equal(turn.appliedTimeScale, Math.fround(0.005));

  const tail = advance(clock, Math.PI);
  assert.equal(tail.timeScale, Math.fround(0.3));
  assert.equal(clock.lookBuffer, 0);

  const stopped = advance(clock, Math.PI);
  assert.equal(stopped.timeScale, Math.fround(0.005));
  assert.equal(stopped.appliedTimeScale, Math.fround(0.3));
  assert.equal(advance(clock, Math.PI).appliedTimeScale, Math.fround(0.005));
});
