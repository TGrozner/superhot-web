import test from 'node:test';
import assert from 'node:assert/strict';
import {createDojoReplayRecap} from '../src/flow/dojo-replay-recap.js';

const round = (score, shots, victory = true) => ({
  quota: 6, victory, kills: victory ? 6 : 2, shots,
  dodges: 0, score, elapsedSeconds: victory ? 31 : 20,
});

test('Dojo replay displays the absolute score needed next run', () => {
  const first = createDojoReplayRecap({...round(1000, 8), elapsedSeconds:30});
  // A shot-free victory with a lower score should present the next absolute PB,
  // not the point difference from this run (score resets on replay).
  const second = createDojoReplayRecap(round(800, 0), first.best);
  assert.equal(second.completedChallenge, 'no-shots');
  assert.deepEqual(second.best?.pendingChallenge, {kind:'score',target:1001});
  assert.equal(second.replayTarget, 'ATTEINS 1001 PTS POUR UN NOUVEAU RECORD');
  assert.match(second.text, /DÉFI : ATTEINS 1001 PTS POUR UN NOUVEAU RECORD/);

  const failed = createDojoReplayRecap(round(200, 1, false), second.best);
  assert.equal(failed.replayTarget, 'ATTEINS 1001 PTS POUR LE RECORD');
  assert.deepEqual(failed.best?.pendingChallenge, second.best?.pendingChallenge);

  const succeeded = createDojoReplayRecap(round(1001, 8), failed.best);
  assert.equal(succeeded.completedChallenge, 'score');
  assert.equal(succeeded.best?.bestScore, 1001);
});
