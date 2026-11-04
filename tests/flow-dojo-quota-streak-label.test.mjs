import test from 'node:test';
import assert from 'node:assert/strict';
import {createDojoReplayRecap} from '../src/flow/dojo-replay-recap.js';

const round = (quota, victory, previous = null) => createDojoReplayRecap({
  quota, victory, kills: victory ? quota : 2, shots: victory ? 0 : 4,
  dodges: victory ? 3 : 0, score: victory ? 3000 : 150,
  elapsedSeconds: victory ? 18 : 12,
}, previous);

test('streak language declares its per-quota scope after interleaved defeats', () => {
  const sixFirst = round(6, true);
  assert.equal(sixFirst.best.masteryMask, 7);
  assert.equal(sixFirst.best.currentStreak, 1);
  assert.match(sixFirst.replayTarget, /FAIS 2 VICTOIRES D’AFFILÉE \(FORMAT 6 UNIQUEMENT\)/);

  const sevenLost = round(7, false);
  assert.equal(sevenLost.best.currentStreak, 0);
  // Existing persistence keeps each quota separate; a loss at seven cannot
  // disprove a same-quota streak at six, but it DOES disprove global adjacency.
  const sixSecond = round(6, true, sixFirst.best);
  assert.equal(sixSecond.currentStreak, 2);
  assert.equal(sixSecond.completedChallenge, 'streak');
  assert.match(sixSecond.text, /SÉRIE 2 \(FORMAT 6 UNIQUEMENT\)/);
  assert.match(sixSecond.text, /DÉFI RÉUSSI : SÉRIE DE VICTOIRES FORMAT 6/);
  assert.match(sixSecond.replayTarget, /FAIS 3 VICTOIRES D’AFFILÉE \(FORMAT 6 UNIQUEMENT\)/);

  const sixLost = round(6, false, sixSecond.best);
  assert.equal(sixLost.currentStreak, 0);
  assert.match(sixLost.text, /SÉRIE 2 BRISÉE \(FORMAT 6 UNIQUEMENT\)/);
  assert.match(sixLost.text, /BILAN DÉFI : SÉRIE BRISÉE .* FORMAT 6 UNIQUEMENT/);
  assert.match(sixLost.replayTarget, /FORMAT 6 UNIQUEMENT/);
});
