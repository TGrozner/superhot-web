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
  assert.equal(failed.best.bestScore, record.bestScore);
  assert.equal(failed.best.currentStreak, 0, 'death breaks the active winning streak');
  assert.equal(failed.best.bestStreak, 1, 'best streak is retained');
  assert.equal(failed.shouldPersist, true, 'death must persist a broken streak');
  assert.match(failed.text, /record : 750 pts/);
  assert.throws(() => result(7, {kills:5}), /contradicts/);
  assert.throws(() => result(7, {elapsedSeconds:Infinity}), /finite/);
});

test('existing Dojo finish screens expose Web style grades and actionable retry targets', () => {
  const c = result(6, {score:600, dodges:0});
  assert.equal(c.styleGrade, 'C');
  assert.equal(c.nextStyleTarget, 1050);
  assert.match(c.text, /STYLE C.*1050 PTS/);
  const b = result(6, {score:1100});
  assert.equal(b.styleGrade, 'B');
  assert.equal(b.nextStyleTarget, 1500);
  const a = result(7, {score:2000});
  assert.equal(a.styleGrade, 'A');
  assert.equal(a.nextStyleTarget, 2800);
  const s = result(7, {score:2800});
  assert.equal(s.styleGrade, 'S');
  assert.equal(s.nextStyleTarget, null);
  assert.match(s.text, /STYLE S/);
  assert.equal(s.best.bestScore, 2800);
  const loss = createDojoReplayRecap({
    quota:7, victory:false, kills:4, shots:10, dodges:0,
    score:400, elapsedSeconds:17.5,
  });
  assert.equal(loss.styleGrade, null);
  assert.equal(loss.nextStyleTarget, null);
  assert.match(loss.text, /3 ENNEMIS RESTANTS/);
  assert.equal(loss.shouldPersist, false);
});

test('Dojo win streak survives reload, upgrades legacy personal bests and resets on loss', () => {
  const legacy = readDojoReplayBest(JSON.stringify({
    schemaVersion:1, quota:6, victories:8, bestScore:1900, fastestSeconds:19.4,
  }), 6);
  assert.equal(legacy.schemaVersion, 2);
  assert.equal(legacy.currentStreak, 0, 'legacy history cannot prove a streak');
  assert.equal(legacy.bestStreak, 0);
  const one = result(6, {best:legacy, score:700, elapsedSeconds:25});
  assert.equal(one.currentStreak, 1);
  assert.equal(one.best.victories, 9);
  assert.equal(one.best.bestScore, 1900);
  const two = result(6, {best:readDojoReplayBest(JSON.stringify(one.best), 6)});
  assert.equal(two.currentStreak, 2);
  assert.equal(two.bestStreak, 2);
  assert.match(two.text, /SÉRIE 2.*RECORD SÉRIE/);
  assert.equal(readDojoReplayBest(JSON.stringify(two.best), 7), null);
  const defeat = createDojoReplayRecap({
    quota:6, victory:false, kills:4, shots:5, dodges:2,
    score:450, elapsedSeconds:30,
  }, readDojoReplayBest(JSON.stringify(two.best), 6));
  assert.equal(defeat.shouldPersist, true);
  assert.equal(defeat.currentStreak, 0);
  assert.equal(defeat.bestStreak, 2);
  assert.equal(defeat.best.victories, 10);
  assert.equal(defeat.best.bestScore, 1900);
  assert.match(defeat.text, /SÉRIE 2 BRISÉE/);
  const afterLoss = result(6, {best:readDojoReplayBest(JSON.stringify(defeat.best), 6)});
  assert.equal(afterLoss.currentStreak, 1);
  assert.equal(afterLoss.bestStreak, 2);
  assert.doesNotMatch(afterLoss.text, /RECORD SÉRIE/);
  assert.equal(readDojoReplayBest(JSON.stringify({
    ...defeat.best, currentStreak:4, bestStreak:2,
  }), 6), null, 'corrupt streak must not advance a record');
});

test('replay target uses the previous same-quota PB and offers a shot-free challenge', () => {
  const previous = result(6, {score:900, elapsedSeconds:22}).best;
  const chaseScore = result(6, {best:previous, score:850, elapsedSeconds:30});
  assert.equal(chaseScore.replayTarget, '+51 PTS POUR UN NOUVEAU RECORD');
  assert.match(chaseScore.text, /DÉFI : \+51 PTS/);
  const chaseTime = result(6, {best:previous, score:1000, elapsedSeconds:30});
  assert.equal(chaseTime.replayTarget, 'SOUS 22.0 S POUR UN NOUVEAU RECORD');
  const challenge = result(6, {best:previous, score:1000, elapsedSeconds:18});
  assert.equal(challenge.replayTarget, 'GAGNE SANS TIRER');
  const shotFree = result(6, {best:previous, score:1000, elapsedSeconds:18, shots:0});
  assert.equal(shotFree.replayTarget, null);
  const first = result(6);
  assert.equal(first.replayTarget, null, 'no invented personal record on first clear');
  const failed = createDojoReplayRecap({
    quota:6, victory:false, kills:4, shots:4, dodges:0,
    score:300, elapsedSeconds:25,
  }, previous);
  assert.equal(failed.replayTarget, null, 'loss never receives a victory challenge');
  assert.equal(readDojoReplayBest(JSON.stringify(chaseScore.best), 7), null);
});
