import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceDojoGlobalStreak, readDojoGlobalStreak} from '../src/flow/dojo-global-streak.js';

test('global win streak uses actual chronological rounds across 6/7 quotas', () => {
  const first = advanceDojoGlobalStreak(null, {quota:6, victory:true});
  assert.equal(first.announcement, null);
  const second = advanceDojoGlobalStreak(first.record, {quota:7, victory:true});
  assert.equal(second.record.currentStreak, 2);
  assert.match(second.announcement, /SÉRIE GLOBALE 2 VICTOIRES.*NOUVEAU RECORD/);
  const loss = advanceDojoGlobalStreak(readDojoGlobalStreak(JSON.stringify(second.record)),
    {quota:7, victory:false});
  assert.equal(loss.record.currentStreak, 0);
  assert.equal(loss.record.bestStreak, 2);
  assert.equal(loss.announcement, 'SÉRIE GLOBALE 2 BRISÉE');
  const again = advanceDojoGlobalStreak(loss.record, {quota:6, victory:true});
  assert.equal(again.record.currentStreak, 1);
  assert.equal(again.record.bestStreak, 2);
  assert.equal(again.record.attempts, 4);
  assert.equal(again.record.victories, 3);
  assert.equal(again.announcement, null);
  assert.equal(again.provenance, 'WEB_ONLY');
});

test('cannot rebuild global order from historical per-format records or untrusted data', () => {
  assert.equal(readDojoGlobalStreak(null), null);
  assert.equal(readDojoGlobalStreak('{bad'), null);
  const initial = advanceDojoGlobalStreak(null, {quota:7, victory:false}).record;
  assert.equal(initial.currentStreak, 0);
  for (const corrupt of [
    {...initial, schemaVersion:2}, {...initial, attempts:0},
    {...initial, victories:2}, {...initial, bestStreak:1},
    {...initial, currentStreak:1}, {...initial, lastQuota:8},
  ]) assert.equal(readDojoGlobalStreak(JSON.stringify(corrupt)), null);
  assert.throws(() => advanceDojoGlobalStreak(initial, {quota:8, victory:true}), TypeError);
});
