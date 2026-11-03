import test from 'node:test';
import assert from 'node:assert/strict';
import {createDojoReplayRecap, readDojoReplayBest} from '../src/flow/dojo-replay-recap.js';

const result = (quota=6, extras={}) => createDojoReplayRecap({
  quota, victory:true, kills:quota, shots:9, dodges:1,
  score:750, elapsedSeconds:31.4, ...extras,
}, extras.best ?? null);

test('victory records encourage real 6/7 Dojo replays without modifying existing score', () => {
  const first = result();
  assert.equal(first.milestone, 'first-clear');
  assert.equal(first.best.bestScore, 750);
  assert.equal(first.shouldPersist, true);
  assert.equal(first.provenance, 'WEB_ONLY');
  const previous = readDojoReplayBest(JSON.stringify(first.best), 6);
  const faster = result(6, {score:700, elapsedSeconds:26.1, best:previous});
  assert.equal(faster.milestone, 'speed-record');
  assert.equal(faster.best.bestScore, 750);
  assert.equal(faster.best.fastestSeconds, 26.1);
  assert.equal(faster.best.victories, 2);
  const record = result(6, {score:800, elapsedSeconds:22, best:faster.best});
  assert.equal(record.milestone, 'double-record');
  assert.match(record.text, /DOUBLE RECORD/);
  assert.equal(readDojoReplayBest(JSON.stringify(record.best), 7), null,
    '6-kill records must never beat a separate 7-kill challenge');
});

test('death, corrupted storage and invalid scoreboard preserve playable restart', () => {
  assert.equal(readDojoReplayBest('{bad', 6), null);
  assert.equal(readDojoReplayBest(JSON.stringify({schemaVersion:2}), 6), null);
  const record = result(7).best;
  const failed = createDojoReplayRecap({
    quota:7, victory:false, kills:4, shots:12, dodges:2,
    score:450, elapsedSeconds:18.5,
  }, record);
  assert.equal(failed.milestone, 'retry');
  assert.equal(failed.best, record);
  assert.equal(failed.shouldPersist, false);
  assert.match(failed.text, /record : 750 pts/);
  assert.throws(() => result(7, {kills:5}), /contradicts/);
  assert.throws(() => result(7, {elapsedSeconds:Infinity}), /finite/);
});
