import test from 'node:test';
import assert from 'node:assert/strict';
import {createDojoReplayRecap} from '../src/flow/dojo-replay-recap.js';

test('challenge appears before metric summary', () => {
  const first = createDojoReplayRecap({quota:6,victory:true,kills:6,shots:8,dodges:0,score:900,elapsedSeconds:30});
  assert.ok(first.text.indexOf('DÉFI : GAGNE SANS TIRER') < first.text.indexOf('6/6 ennemis'));
});
