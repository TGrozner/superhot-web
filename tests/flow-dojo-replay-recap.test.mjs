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
  assert.equal(loss.shouldPersist, true);
  assert.equal(loss.best.victories, 0);
  assert.equal(loss.best.bestFailedKills, 4);
});

test('Dojo win streak survives reload, upgrades legacy personal bests and resets on loss', () => {
  const legacy = readDojoReplayBest(JSON.stringify({
    schemaVersion:1, quota:6, victories:8, bestScore:1900, fastestSeconds:19.4,
  }), 6);
  assert.equal(legacy.schemaVersion, 4);
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
  assert.equal(shotFree.replayTarget, 'RÉUSSIS 3 ESQUIVES EN UNE VICTOIRE',
    'after earning the no-shot medal, offer the next missing mastery badge');
  const first = result(6);
  assert.equal(first.replayTarget, 'GAGNE SANS TIRER', 'first clear offers an attainable skill goal, not an invented PB');
  const failed = createDojoReplayRecap({
    quota:6, victory:false, kills:4, shots:4, dodges:0,
    score:300, elapsedSeconds:25,
  }, previous);
  assert.equal(failed.replayTarget, 'VISE 5 ÉLIMINATIONS AU PROCHAIN ESSAI', 'defeat has a practical retry goal');
  assert.equal(readDojoReplayBest(JSON.stringify(chaseScore.best), 7), null);
});


test('Dojo mastery medals unlock across actual victories and remain isolated per quota', () => {
  const first = result(6, {score:2100, shots:8, dodges:0});
  assert.equal(first.best.masteryMask, 1);
  assert.deepEqual(first.newMedals, ['STYLE S']);
  assert.equal(first.masteryCount, 1);
  assert.match(first.text, /MAÎTRISE 1\/3.*MÉDAILLE : STYLE S/);
  const second = result(6, {best:readDojoReplayBest(JSON.stringify(first.best), 6),
    score:500, shots:0, dodges:3});
  assert.equal(second.best.masteryMask, 7);
  assert.equal(second.masteryCount, 3);
  assert.deepEqual(second.newMedals, ['SANS TIRER', '3 ESQUIVES']);
  const third = result(6, {best:second.best, score:700, shots:0, dodges:3});
  assert.deepEqual(third.newMedals, [], 'a medal cannot be earned twice');
  assert.equal(third.masteryCount, 3);
  assert.equal(readDojoReplayBest(JSON.stringify(third.best), 7), null);
  assert.equal(result(7).masteryCount, 0, '7-kill mastery starts independently');
  const upgradedV2 = readDojoReplayBest(JSON.stringify({
    schemaVersion:2, quota:6, victories:5, bestScore:900, fastestSeconds:18,
    currentStreak:2, bestStreak:3,
  }), 6);
  assert.equal(upgradedV2.schemaVersion, 4);
  assert.equal(upgradedV2.currentStreak, 2);
  assert.equal(upgradedV2.masteryMask, 0, 'historical medals cannot be inferred');
  assert.equal(readDojoReplayBest(JSON.stringify({...second.best, masteryMask:8}), 6), null);
  const defeat = createDojoReplayRecap({
    quota:6, victory:false, kills:4, shots:0, dodges:3, score:2100, elapsedSeconds:20,
  }, second.best);
  assert.equal(defeat.best.masteryMask, 7);
  assert.deepEqual(defeat.newMedals, [], 'no medal from a loss');
  assert.equal(defeat.masteryCount, 3);
});

test('Dojo retry coaching never invents a PB or re-awards completed medals', () => {
  const newClear = result(6, {shots:0, dodges:0, score:500});
  assert.equal(newClear.replayTarget, 'RÉUSSIS 3 ESQUIVES EN UNE VICTOIRE');
  const nearMaster = result(6, {shots:0, dodges:3, score:900});
  assert.equal(nearMaster.replayTarget, 'DÉCROCHE LE STYLE S');
  const mastered = result(6, {shots:0, dodges:3, score:2100});
  assert.equal(mastered.replayTarget, null, 'three earned medals need no artificial challenge');
  const lostEarly = createDojoReplayRecap({
    quota:7, victory:false, kills:0, shots:3, dodges:0, score:0, elapsedSeconds:5,
  });
  assert.equal(lostEarly.replayTarget, 'VISE 1 ÉLIMINATION AU PROCHAIN ESSAI');
  const lostAfterQuota = createDojoReplayRecap({
    quota:7, victory:false, kills:7, shots:8, dodges:0, score:2000, elapsedSeconds:25,
  });
  assert.equal(lostAfterQuota.replayTarget, 'SURVIS JUSQU’À LA VICTOIRE');
  assert.equal(lostAfterQuota.shouldPersist, true);
});

test('failed Dojo rounds persist best partial clear and unlock a real first victory', () => {
  const lose = (kills, best = null) => createDojoReplayRecap({
    quota:7, victory:false, kills, shots:5, dodges:1, score:kills*100,
    elapsedSeconds:20,
  }, best);
  const first = lose(4);
  assert.equal(first.milestone, 'retry-progress');
  assert.match(first.text, /^NOUVEAU PALIER AVANT LA VICTOIRE/);
  assert.equal(first.best.victories, 0);
  assert.equal(first.best.bestFailedKills, 4);
  assert.equal(first.best.trackedAttempts, 1);
  assert.equal(first.shouldPersist, true);
  const next = lose(2, readDojoReplayBest(JSON.stringify(first.best), 7));
  assert.equal(next.best.bestFailedKills, 4);
  assert.equal(next.best.trackedAttempts, 2);
  assert.equal(next.milestone, 'retry', 'weaker loss must not re-award a progress milestone');
  assert.equal(next.replayTarget, 'VISE 5 ÉLIMINATIONS AU PROCHAIN ESSAI');
  assert.match(next.text, /MEILLEUR ESSAI 4\/7/);
  const better = lose(5, next.best);
  assert.equal(better.milestone, 'retry-progress');
  assert.equal(better.best.bestFailedKills, 5);
  assert.equal(better.replayTarget, 'VISE 6 ÉLIMINATIONS AU PROCHAIN ESSAI');
  const cleared = result(7, {best:readDojoReplayBest(JSON.stringify(better.best), 7)});
  assert.equal(cleared.milestone, 'first-clear');
  assert.match(cleared.text, /^PREMIÈRE VICTOIRE/);
  assert.match(cleared.text, /4 ESSAIS POUR LA PREMIÈRE VICTOIRE/);
  assert.equal(cleared.best.trackedAttempts, 4);
  assert.equal(cleared.best.victories, 1);
  assert.equal(cleared.best.bestFailedKills, 5);
  assert.equal(readDojoReplayBest(JSON.stringify(cleared.best), 6), null);
  assert.doesNotMatch(result(6).text, /ESSAIS POUR LA PREMIÈRE VICTOIRE/,
    'a first-try win must not pretend there were previous defeats');
  const legacy = readDojoReplayBest(JSON.stringify({
    schemaVersion:3, quota:7, victories:5, bestScore:1700, fastestSeconds:25,
    currentStreak:2, bestStreak:3, masteryMask:5,
  }), 7);
  assert.equal(legacy.schemaVersion, 4);
  assert.equal(legacy.trackedAttempts, 5);
  assert.equal(legacy.bestFailedKills, 0);
  assert.equal(legacy.masteryMask, 5);
  assert.equal(readDojoReplayBest(JSON.stringify({...better.best, trackedAttempts:0}), 7), null);
  assert.equal(readDojoReplayBest(JSON.stringify({...better.best, fastestSeconds:2}), 7), null);
});
