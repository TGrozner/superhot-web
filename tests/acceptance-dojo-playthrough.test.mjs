import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDojoPlaythrough, DOJO_TRACE_STATUS } from '../scripts/acceptance-dojo-playthrough.mjs';

// Authored synthetic data tests only verify the acceptance gate, NOT a browser run.
const frame = (frameId, activeScreen, killed, enemies, {
  killTarget = 6, scenePath = 'Assets/Scenes/SHRL_Dojo2.unity', buildIndex = 10,
} = {}) => ({
  frameId, activeScreen,
  nativeScene: { source: { scenePath, buildIndex } },
  gameplay: { encounter: { killed, killTarget, enemies } },
});
const enemy = (id, alive = true) => ({ id, alive });
const completeRun = () => [
  frame(1, 'playing', 0, []),
  frame(10, 'playing', 0, [enemy('native-encounter-0')]),
  frame(21, 'playing', 1, [enemy('native-encounter-0', false)]),
  frame(40, 'playing', 6, [enemy('native-encounter-5', false)]),
  frame(60, 'win', 6, [enemy('native-encounter-5', false)]),
  frame(80, 'playing', 0, []),
];

test('SH10 synthetic full-run fixture satisfies Web trace protocol, never native parity', () => {
  const result = assessDojoPlaythrough({ frames: completeRun() });
  assert.equal(result.complete, true);
  assert.equal(result.status, DOJO_TRACE_STATUS.PASSED);
  assert.equal(result.killTarget, 6);
  assert.equal(result.frames, 6);
  assert.ok(Object.values(result.milestones).every(Boolean));
  assert.equal(result.browserExecutionIndependentlyVerified, false);
  assert.equal(result.originalNativeComparisonPerformed, false);
  assert.match(result.evidence, /UNAUTHENTICATED/);
});

test('SH10 incomplete scenario never promotes spawn and kills to victory', () => {
  const partial = completeRun().slice(0, 4);
  const result = assessDojoPlaythrough(partial);
  assert.equal(result.complete, false);
  assert.equal(result.status, DOJO_TRACE_STATUS.INCOMPLETE);
  assert.equal(result.milestones.enemySpawned, true);
  assert.equal(result.milestones.victoryScreenWithKillQuota, false);
  assert.match(result.errors.join('\n'), /missing win screen/);
});

test('SH10 win without a satisfying kill quota is rejected', () => {
  const partial = completeRun();
  partial[4].gameplay.encounter.killed = 5;
  assert.equal(assessDojoPlaythrough(partial).complete, false);
});

test('SH10 stale enemies and kill counter after victory are not a clean restart', () => {
  const stale = completeRun();
  stale[5].gameplay.encounter.enemies = [enemy('native-encounter-5', false)];
  assert.match(assessDojoPlaythrough(stale).errors.join('\n'), /post-victory restart/);
  stale[5].gameplay.encounter.enemies = [];
  stale[5].gameplay.encounter.killed = 1;
  assert.match(assessDojoPlaythrough(stale).errors.join('\n'), /post-victory restart/);
});

test('SH10 requires a witnessed enemy spawn, not kill total alone', () => {
  const impossible = completeRun().map(f => structuredClone(f));
  impossible[1].gameplay.encounter.enemies = [];
  assert.equal(assessDojoPlaythrough(impossible).milestones.enemySpawned, false);
});

test('SH10 wrong scene or unverified source identity fail closed', () => {
  const frames = completeRun();
  frames[2].nativeScene.source.scenePath = 'Scenes/SHRL_ContainerPort.unity';
  const result = assessDojoPlaythrough(frames);
  assert.equal(result.complete, false);
  assert.equal(result.status, DOJO_TRACE_STATUS.INVALID);
  assert.match(result.errors.join('\n'), /Dojo\/build10/);
});

test('SH10 validates sample chronology and source-authored target limits', () => {
  const frames = completeRun();
  frames[3].frameId = 21;
  assert.equal(assessDojoPlaythrough(frames).status, DOJO_TRACE_STATUS.INVALID);
  frames[3].frameId = 40;
  frames[1].gameplay.encounter.killTarget = 9;
  assert.equal(assessDojoPlaythrough(frames).status, DOJO_TRACE_STATUS.INVALID);
});

test('SH10 counter reset or kill quota change during play cannot certify continuous run', () => {
  const frames = completeRun();
  frames.splice(3, 0, frame(30, 'playing', 0, [enemy('native-encounter-1')]));
  assert.match(assessDojoPlaythrough(frames).errors.join('\n'), /kill counter reset/);
  const changed = completeRun();
  changed[3].gameplay.encounter.killTarget = 7;
  assert.match(assessDojoPlaythrough(changed).errors.join('\n'), /kill target changed/);
});

test('SH10 rejects missing or oversized frame arrays without reading private material', () => {
  assert.equal(assessDojoPlaythrough({ frames: [] }).status, DOJO_TRACE_STATUS.INVALID);
  assert.equal(assessDojoPlaythrough(null).status, DOJO_TRACE_STATUS.INVALID);
  assert.equal(assessDojoPlaythrough({ frames: Array(100001).fill(null) }).status, DOJO_TRACE_STATUS.INVALID);
});
