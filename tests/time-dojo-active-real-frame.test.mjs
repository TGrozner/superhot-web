import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleActiveFrameDeltas } from '../src/time.js';

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

// Web game-feel/fairness regression, not a native MCD or browser FPS measurement.
test('Dojo score time and unarmed cooldown use active wall time even at 10 FPS', () => {
  let previous = 1000;
  let scoreSeconds = 0;
  let simulatedSeconds = 0;
  let punchCooldown = 0.36;
  let punchReadyAt = null;

  for (let i = 1; i <= 10; i++) {
    const frame = sampleActiveFrameDeltas(previous, 1000 + i * 100, 1000);
    previous = frame.nextTimestampMs;
    scoreSeconds += frame.activeRealDt;
    simulatedSeconds += frame.simulationDt;
    punchCooldown = Math.max(0, punchCooldown - frame.activeRealDt);
    if (punchReadyAt === null && punchCooldown === 0) punchReadyAt = i * 100;
  }

  near(scoreSeconds, 1);
  near(simulatedSeconds, 0.5);
  assert.equal(punchReadyAt, 400,
    '360 ms real-time punch cooldown recovers on the fourth 100 ms frame, not after 800 ms');

  const normal = sampleActiveFrameDeltas(2000, 2000 + 1000 / 60, 2000);
  near(normal.simulationDt, 1 / 60);
  near(normal.activeRealDt, 1 / 60);
});

test('Dojo resume does not charge pre-resume time or replay a physics catch-up', () => {
  // RAF ran while paused. Resume happens part-way between two callbacks.
  const resumed = sampleActiveFrameDeltas(5000, 5150, 5120);
  near(resumed.activeRealDt, 0.03);
  near(resumed.simulationDt, 0.03);
  assert.equal(resumed.nextTimestampMs, 5150);

  const next = sampleActiveFrameDeltas(resumed.nextTimestampMs, 5250, 5120);
  near(next.activeRealDt, 0.1);
  near(next.simulationDt, 0.05);

  const notPlayingYet = sampleActiveFrameDeltas(5250, 5260, 5300);
  assert.equal(notPlayingYet.activeRealDt, 0);
  assert.equal(notPlayingYet.simulationDt, 0);

  const backwards = sampleActiveFrameDeltas(5300, 5290, 5200);
  assert.equal(backwards.activeRealDt, 0);
  assert.equal(backwards.simulationDt, 0);
  assert.equal(backwards.nextTimestampMs, 5290);
});
