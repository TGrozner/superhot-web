import test from 'node:test';
import assert from 'node:assert/strict';
import {createDojoReplayRecap} from '../src/flow/dojo-replay-recap.js';

test('full Dojo mastery opens a replay streak goal',()=>{
  const recap=createDojoReplayRecap({quota:6,victory:true,kills:6,shots:0,dodges:3,score:2100,elapsedSeconds:30});
  assert.equal(recap.best.pendingChallenge.kind,'streak');
  assert.equal(recap.best.pendingChallenge.target,2);
});
