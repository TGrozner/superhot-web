import test from 'node:test';
import assert from 'node:assert/strict';
import {createDojoReplayRecap} from '../src/flow/dojo-replay-recap.js';

test('full Dojo mastery opens a replay streak goal',()=>{
  const recap=createDojoReplayRecap({quota:6,victory:true,kills:6,shots:0,dodges:3,score:2100,elapsedSeconds:30});
  assert.equal(recap.best.pendingChallenge.kind,'streak');
  assert.equal(recap.best.pendingChallenge.target,2);
});

test('mastered Dojo advances streak goals even when later wins miss score/time personal bests', () => {
  const win = (best, score, elapsedSeconds) => createDojoReplayRecap({
    quota:6, victory:true, kills:6, shots:0, dodges:3, score, elapsedSeconds,
  }, best);
  const initial = win(null, 2100, 20);
  assert.deepEqual(initial.best.pendingChallenge, {kind:'streak',target:2});
  const second = win(initial.best, 600, 45);
  assert.equal(second.completedChallenge, 'streak');
  assert.deepEqual(second.best.pendingChallenge, {kind:'streak',target:3},
    'full mastery must advance the streak rather than replace it with PB coaching');
  assert.match(second.text, /FAIS 3 VICTOIRES D’AFFILÉE/);
  assert.equal(second.best.bestScore,2100,'a weaker victory cannot replace the best score');
  assert.equal(second.best.fastestSeconds,20);
  const third = win(second.best, 500, 50);
  assert.equal(third.completedChallenge, 'streak');
  assert.deepEqual(third.best.pendingChallenge, {kind:'streak',target:4});
  const loss = createDojoReplayRecap({
    quota:6,victory:false,kills:3,shots:4,dodges:0,score:250,elapsedSeconds:30,
  }, third.best);
  assert.equal(loss.currentStreak,0);
  assert.deepEqual(loss.best.pendingChallenge,{kind:'streak',target:4},
    'defeat must break the streak, but cannot erase the assigned streak goal');
  assert.match(loss.text,/SÉRIE BRISÉE/);
});
