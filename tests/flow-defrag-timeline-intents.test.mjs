import test from 'node:test';
import assert from 'node:assert/strict';
import { planMcdDefragNonterminalTimeline } from '../src/flow/defrag-timeline-intents.js';

const level = (overrides = {}) => ({
  isLastCell: false, isLevelCell: true, currentCellIndex: 0,
  runCellCount: 4, endlessRun: false, hasDefragLoop: false, ...overrides,
});
const shop = (overrides = {}) => ({
  isLastCell: false, isLevelCell: false, isShopCell: true,
  noShopsActive: false, blockHacks: false, killAllModActive: false,
  replayPlayerPresent: true, ...overrides,
});
const methods = result => result.effects.filter(x => x.kind === 'call').map(x => x.method);

test('level: authored reset precedes loading; StartLevelTimer follows loading', () => {
  const r = planMcdDefragNonterminalTimeline(level());
  assert.equal(r.branch, 'level-load-request');
  assert.deepEqual(r.effects.slice(0, 2), [
    { kind: 'set', field: 'AllowReplays', value: false },
    { kind: 'set', field: 'LoadNextPhase', value: false },
  ]);
  assert.deepEqual(methods(r), [
    'AudioManager.PlayClip', 'LevelLoad.StartLoading',
    'CurrentRun.StartLevelTimer',
    'ImageRevealEffectController.makeScreenshot',
    'ImageRevealEffectController.forceScreenshotOnScreen',
  ]);
  assert.deepEqual(r.effects.find(x => x.method === 'LevelLoad.StartLoading'), {
    kind: 'call', method: 'LevelLoad.StartLoading', levelSource: 'LevelSetup.GetNextLevelInRun()',
  });
  assert.deepEqual(r.effects.filter(x => x.kind === 'set').slice(-2), [
    { kind: 'set', field: 'defragActiveFromLevel', value: false },
    { kind: 'set', field: 'defragActiveFromPiosOrContinue', value: false },
  ]);
});

test('level sound uses run.Cells.Count-1 index, independent of CheckIfLastCell', () => {
  const r = planMcdDefragNonterminalTimeline(level({ currentCellIndex: 3, runCellCount: 4 }));
  assert.equal(r.effects.find(x => x.method === 'AudioManager.PlayClip').cue,
    'AudioResources.NonTerminal.LastCell');
});

test('level at index >=1 requests difficulty lerp; first cell does not', () => {
  assert.equal(methods(planMcdDefragNonterminalTimeline(level())).includes('DifficultyManager.LerpDifficulty'), false);
  assert.equal(methods(planMcdDefragNonterminalTimeline(level({currentCellIndex: 1}))).includes('DifficultyManager.LerpDifficulty'), true);
});

test('endless run adds variety limit independently of difficulty lerp', () => {
  const r = planMcdDefragNonterminalTimeline(level({ endlessRun: true }));
  assert.equal(methods(r).includes('DifficultyManager.HandleInfiniteRunDifficultyVarietyLimit'), true);
  assert.equal(methods(r).includes('DifficultyManager.LerpDifficulty'), false);
});

test('only an existing DefragLoopInstanceId requests an authored 5-second fade', () => {
  const r = planMcdDefragNonterminalTimeline(level({ hasDefragLoop: true }));
  const fade = r.effects.find(x => x.method === 'AudioManager.FadeOutClip');
  assert.deepEqual(fade, {
    kind: 'call', method: 'AudioManager.FadeOutClip',
    instanceField: 'DefragLoopInstanceId', authoredSeconds: 5,
  });
  assert.equal(methods(planMcdDefragNonterminalTimeline(level())).includes('AudioManager.FadeOutClip'), false);
});

test('NoShops has priority and does not read BlockHacks/KillAll', () => {
  const r = planMcdDefragNonterminalTimeline({
    ...shop({ noShopsActive: true }),
    get blockHacks() { throw new Error('BlockHacks should be short-circuited'); },
    get killAllModActive() { throw new Error('KillAll should be short-circuited'); },
  });
  assert.equal(r.branch, 'shop-skip-request');
  assert.deepEqual(methods(r), ['UpdateDefragmentationMenu', 'UpdateCellTravelProperties']);
});

test('BlockHacks skips shop unless KillAll modifier is active', () => {
  const blocked = planMcdDefragNonterminalTimeline(shop({ blockHacks:true, killAllModActive:false }));
  const allowed = planMcdDefragNonterminalTimeline(shop({ blockHacks:true, killAllModActive:true }));
  assert.equal(blocked.branch, 'shop-skip-request');
  assert.equal(allowed.branch, 'shop-selection-scheduled');
});

test('shop selection pauses external replay before authoring 0.5 phase', () => {
  const r = planMcdDefragNonterminalTimeline(shop());
  assert.equal(r.branch, 'shop-selection-scheduled');
  assert.deepEqual(r.effects.slice(2), [
    { kind: 'call', method: 'ReplaysPlayer.Current.PauseExternal' },
    { kind: 'phase-authored', phase: 'SHGUIanimationtimeline.NewPhase',
      callback: 'BeginShopSelection', on: 'OnEnd', authoredDurationSeconds: 0.5,
      timebase: 'UNVERIFIED', callbackExecuted: false },
  ]);
});

test('shop selection without ReplaysPlayer still authors phase, not a pause', () => {
  const r = planMcdDefragNonterminalTimeline(shop({ replayPlayerPresent: false }));
  assert.deepEqual(methods(r), []);
  assert.equal(r.effects.at(-1).callbackExecuted, false);
});

test('non-level/non-shop cell returns without requesting transition', () => {
  const r = planMcdDefragNonterminalTimeline({isLastCell:false,isLevelCell:false,isShopCell:false});
  assert.equal(r.branch, 'other-cell-no-transition');
  assert.equal(r.effects.length, 2);
});

test('no inferred terminal branch or synthesized missing run/scene flags', () => {
  assert.throws(() => planMcdDefragNonterminalTimeline(level({isLastCell:true})), /last-cell branches/);
  assert.throws(() => planMcdDefragNonterminalTimeline(level({runCellCount:0})), /runCellCount/);
  assert.throws(() => planMcdDefragNonterminalTimeline(level({currentCellIndex:4})), /currentCellIndex/);
  assert.throws(() => planMcdDefragNonterminalTimeline(shop({replayPlayerPresent:undefined})), /replayPlayerPresent/);
  assert.throws(() => planMcdDefragNonterminalTimeline(shop({noShopsActive:0})), /noShopsActive/);
});
