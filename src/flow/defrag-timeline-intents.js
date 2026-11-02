/**
 * Source-bounded, DOM-free intent planner for ONE nonterminal
 * AppDefragmentationMenu.UpdateTimeline invocation.
 *
 * MCD Steam build 20299547, decompiled Assembly-CSharp:
 * AppDefragmentationMenu.cs:721-724,800-899.
 *
 * No callback is executed, time advances, level loads, shop opens, sound plays,
 * snapshot is captured, or run is saved by this planner. It is NOT a 1:1 runtime.
 * The last-cell branch belongs to a separate contract; never guess it here.
 * Provenance and negative boundaries: docs/parity/flow-defrag-timeline.md.
 */

function requireRecord(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be a record`);
  }
}

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name} must be an explicitly supplied boolean`);
  }
  return value;
}

function requireSafeCellIndex(value, name, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer >= ${minimum}`);
  }
  return value;
}

const call = (method, options) => ({ kind: 'call', method, ...(options ?? {}) });
const set = (field, value) => ({ kind: 'set', field, value });

/**
 * Plan a nonterminal disk-cell branch after the interpolator reaches the
 * Timeline dispatcher. This does not call UpdateDefragmentationMenu itself.
 *
 * Supply values from the current native run rather than defaulting to Web
 * three-room state. `isLastCell: true` is deliberately NOT accepted; the
 * last-cell endless/finish branches have different rules and callbacks.
 *
 * Input guards are branch-local: e.g. a skipped shop never reads replay state.
 * `phase-authored` is an authored SHGUI phase request, NOT a wall-clock timer.
 */
export function planMcdDefragNonterminalTimeline(signals) {
  requireRecord(signals, 'signals');
  if (requireBoolean(signals.isLastCell, 'isLastCell')) {
    throw new RangeError('last-cell branches require a separate native contract');
  }

  const effects = [set('AllowReplays', false), set('LoadNextPhase', false)];
  const isLevelCell = requireBoolean(signals.isLevelCell, 'isLevelCell');
  if (isLevelCell) {
    const currentCellIndex = requireSafeCellIndex(signals.currentCellIndex, 'currentCellIndex', 0);
    const runCellCount = requireSafeCellIndex(signals.runCellCount, 'runCellCount', 1);
    if (currentCellIndex >= runCellCount) {
      throw new RangeError('currentCellIndex must refer to a run cell');
    }
    const endlessRun = requireBoolean(signals.endlessRun, 'endlessRun');
    const hasDefragLoop = requireBoolean(signals.hasDefragLoop, 'hasDefragLoop');
    const cue = currentCellIndex === runCellCount - 1 ? 'LastCell' : 'LevelIn';

    effects.push(call('AudioManager.PlayClip', { cue: `AudioResources.NonTerminal.${cue}` }));
    if (currentCellIndex >= 1) effects.push(call('DifficultyManager.LerpDifficulty'));
    if (endlessRun) effects.push(call('DifficultyManager.HandleInfiniteRunDifficultyVarietyLimit'));
    if (hasDefragLoop) {
      effects.push(call('AudioManager.FadeOutClip', { instanceField: 'DefragLoopInstanceId', authoredSeconds: 5 }));
    }
    effects.push(call('LevelLoad.StartLoading', { levelSource: 'LevelSetup.GetNextLevelInRun()' }));
    effects.push(call('CurrentRun.StartLevelTimer'));
    effects.push(set('defragActiveFromLevel', false));
    effects.push(set('defragActiveFromPiosOrContinue', false));
    effects.push(call('ImageRevealEffectController.makeScreenshot'));
    effects.push(call('ImageRevealEffectController.forceScreenshotOnScreen'));
    return { branch: 'level-load-request', effects };
  }

  const isShopCell = requireBoolean(signals.isShopCell, 'isShopCell');
  if (!isShopCell) return { branch: 'other-cell-no-transition', effects };

  const noShopsActive = requireBoolean(signals.noShopsActive, 'noShopsActive');
  // Original short-circuit: if NoShops, BlockHacks/KillAll are not consulted.
  let shouldSkipShop = noShopsActive;
  if (!noShopsActive) {
    const blockHacks = requireBoolean(signals.blockHacks, 'blockHacks');
    shouldSkipShop = blockHacks && !requireBoolean(signals.killAllModActive, 'killAllModActive');
  }
  if (shouldSkipShop) {
    effects.push(call('UpdateDefragmentationMenu'));
    effects.push(call('UpdateCellTravelProperties'));
    return { branch: 'shop-skip-request', effects };
  }

  const replayPlayerPresent = requireBoolean(signals.replayPlayerPresent, 'replayPlayerPresent');
  if (replayPlayerPresent) effects.push(call('ReplaysPlayer.Current.PauseExternal'));
  effects.push({
    kind: 'phase-authored',
    phase: 'SHGUIanimationtimeline.NewPhase',
    callback: 'BeginShopSelection',
    on: 'OnEnd',
    authoredDurationSeconds: 0.5,
    timebase: 'UNVERIFIED',
    callbackExecuted: false,
  });
  return { branch: 'shop-selection-scheduled', effects };
}
