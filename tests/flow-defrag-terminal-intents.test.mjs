import test from 'node:test';
import assert from 'node:assert/strict';
import { planMcdDefragSkipFinaleToMenu } from '../src/flow/defrag-terminal-intents.js';

const finalCell = (overrides = {}) => ({
  isLastCell: true, gameType: 'STANDARD_RUN',
  skipDefragSuperhotEnding: true, ...overrides,
});
const calls = result => result.effects.filter(x => x.kind === 'call');

test('fast finale resets timeline and control before FinishRun side effects', () => {
  const result = planMcdDefragSkipFinaleToMenu(finalCell());
  assert.equal(result.branch, 'last-cell-skip-finale-menu-load-request');
  assert.deepEqual(result.effects.slice(0, 6), [
    { kind: 'set', field: 'AllowReplays', value: false },
    { kind: 'set', field: 'LoadNextPhase', value: false },
    { kind: 'set', field: 'givePlayerControl', value: false },
    { kind: 'set', field: 'defragSuperhot', value: true },
    { kind: 'set', field: 'stopDefaultBeepSound', value: true },
    { kind: 'set', field: 'PlayerStats.NewRunUnlocked', value: true },
  ]);
});

test('FinishRun win event follows capture, before requesting SHMenu', () => {
  const result = planMcdDefragSkipFinaleToMenu(finalCell());
  assert.deepEqual(calls(result), [
    { kind: 'call', method: 'AudioManager.AudioFadeInTerminalLoop' },
    { kind: 'call', method: 'ImageRevealEffectController.makeScreenshot' },
    { kind: 'call', method: 'ImageRevealEffectController.forceScreenshotOnScreen' },
    { kind: 'call', method: 'EventManager.Rise', event: 'SHRLManager.RunEvent.OnWin' },
    { kind: 'call', method: 'Crosshair2D.SetEnabled', enabled: false },
    { kind: 'call', method: 'LevelSetup.GetLevelInfoBySceneFileName', sceneFileName: 'SHMenu', resultKey: 'levelInfo' },
    { kind: 'call', method: 'LevelLoad.StartLoading', levelInfoFrom: 'levelInfo' },
  ]);
  assert.deepEqual(result.effects.slice(-3), [
    { kind: 'set', field: 'defragActiveFromLevel', value: false },
    { kind: 'set', field: 'defragActiveFromPiosOrContinue', value: false },
    { kind: 'call', method: 'LevelLoad.StartLoading', levelInfoFrom: 'levelInfo' },
  ]);
});

test('not-last cell never takes terminal path (nonterminal planner is separate)', () => {
  assert.throws(() => planMcdDefragSkipFinaleToMenu(finalCell({ isLastCell: false })), /does not directly invoke FinishRun/);
});

test('ENDLESS_RUN takes restart scheduler branch even if skip flag is true', () => {
  assert.throws(() => planMcdDefragSkipFinaleToMenu(finalCell({ gameType: 'ENDLESS_RUN' })), /does not directly invoke FinishRun/);
});

test('non-skip finale enters authored animation instead of immediate FinishRun', () => {
  assert.throws(() => planMcdDefragSkipFinaleToMenu(finalCell({ skipDefragSuperhotEnding: false })), /does not directly invoke FinishRun/);
});

test('missing live native signals are rejected, never Web-defaulted', () => {
  for (const invalid of [null, undefined, [], 5]) {
    assert.throws(() => planMcdDefragSkipFinaleToMenu(invalid), /signals/);
  }
  assert.throws(() => planMcdDefragSkipFinaleToMenu(finalCell({ isLastCell: undefined })), /isLastCell/);
  assert.throws(() => planMcdDefragSkipFinaleToMenu(finalCell({ gameType: undefined })), /gameType/);
  assert.throws(() => planMcdDefragSkipFinaleToMenu(finalCell({ gameType: '' })), /gameType/);
  assert.throws(() => planMcdDefragSkipFinaleToMenu(finalCell({ skipDefragSuperhotEnding: undefined })), /skipDefragSuperhotEnding/);
});

test('planner is pure and does not mark requested load as completed', () => {
  const input = Object.freeze(finalCell());
  const result = planMcdDefragSkipFinaleToMenu(input);
  assert.equal(Object.hasOwn(result, 'levelLoaded'), false);
  assert.equal(Object.hasOwn(result, 'winObserved'), false);
  assert.deepEqual(input, finalCell());
  assert.deepEqual(planMcdDefragSkipFinaleToMenu(input), result);
});
