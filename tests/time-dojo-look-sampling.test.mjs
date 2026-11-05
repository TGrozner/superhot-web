import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcdGameplayClock, stepMcdGameplayClock } from '../src/time.js';

// Creative Web look sampler regression, NOT a source-qualified MCD cadence.
// Native TimeControl's initial write deferral is explicitly skipped here to
// isolate real browser frame deltas; #289 covers opening/replay separately.
test('Dojo Web look reacts at 60 Hz and preserves fast 120 Hz aim reversals', () => {
  const sixty = createMcdGameplayClock();
  sixty.source.delayedUpdates = 0;
  const first = stepMcdGameplayClock(sixty, {
    dt: 1 / 60, yaw: Math.PI / 3, pitch: 0,
  });
  assert.equal(first.appliedTimeScale, 1);
  assert.equal(first.timeScale, Math.fround(0.3),
    'one exact 60 Hz frame of real turning must not miss the look sampler');

  const highRefresh = createMcdGameplayClock();
  highRefresh.source.delayedUpdates = 0;
  const turn = stepMcdGameplayClock(highRefresh, {
    dt: 1 / 120, yaw: 0.5, pitch: 0,
  });
  assert.equal(turn.timeScale, Math.fround(0.005),
    'a half-window still waits for a complete look sample');
  const reverse = stepMcdGameplayClock(highRefresh, {
    dt: 1 / 120, yaw: 0, pitch: 0,
  });
  assert.equal(reverse.timeScale, Math.fround(0.3),
    'turning out and back between samples must still unfreeze time');
  assert.equal(highRefresh.lookBuffer, Math.fround(0.3),
    'reversal uses the existing two-sample anti-linger cap');

  let settled = reverse;
  for (let i = 0; i < 7; i++) {
    settled = stepMcdGameplayClock(highRefresh, {
      dt: 1 / 120, yaw: 0, pitch: 0,
    });
  }
  assert.equal(settled.timeScale, Math.fround(0.005),
    'stationary aim must return to slow-motion without a long tail');
});
