/**
 * Source-bounded last-cell fast-finale branch of MCD
 * AppDefragmentationMenu.UpdateTimeline -> FinishRun.
 *
 * Static source: build 20299547, AppDefragmentationMenu.cs:721-754,
 * 908-920; private corpus artifact 13149219697. The route is reachable
 * ONLY if last cell, non-ENDLESS_RUN and SkipDefragSuperhotEnding.
 * This is an inert command plan: no scene, audio, save or win is performed.
 * Other last-cell paths (endless restart / animated finale) are intentionally
 * excluded; do not treat them as an immediate win or SHMenu load.
 */
const command = (method, extras = {}) => ({ kind: 'call', method, ...extras });
const assign = (field, value) => ({ kind: 'set', field, value });

export function planMcdDefragSkipFinaleToMenu(signals) {
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)) {
    throw new TypeError('signals must be a record');
  }
  if (typeof signals.isLastCell !== 'boolean') {
    throw new TypeError('isLastCell must be an explicit boolean');
  }
  if (typeof signals.gameType !== 'string' || !signals.gameType) {
    throw new TypeError('gameType must be an explicit nonempty string');
  }
  if (typeof signals.skipDefragSuperhotEnding !== 'boolean') {
    throw new TypeError('skipDefragSuperhotEnding must be an explicit boolean');
  }
  if (!signals.isLastCell || signals.gameType === 'ENDLESS_RUN' ||
      !signals.skipDefragSuperhotEnding) {
    throw new RangeError('source branch does not directly invoke FinishRun; no terminal request inferred');
  }

  return {
    branch: 'last-cell-skip-finale-menu-load-request',
    effects: [
      assign('AllowReplays', false),
      assign('LoadNextPhase', false),
      assign('givePlayerControl', false),
      assign('defragSuperhot', true),
      assign('stopDefaultBeepSound', true),
      // FinishRun(): its side effects are expanded in source order.
      assign('PlayerStats.NewRunUnlocked', true),
      command('AudioManager.AudioFadeInTerminalLoop'),
      command('ImageRevealEffectController.makeScreenshot'),
      command('ImageRevealEffectController.forceScreenshotOnScreen'),
      assign('DefragAppClose', true),
      command('EventManager.Rise', { event: 'SHRLManager.RunEvent.OnWin' }),
      command('Crosshair2D.SetEnabled', { enabled: false }),
      command('LevelSetup.GetLevelInfoBySceneFileName', {
        sceneFileName: 'SHMenu', resultKey: 'levelInfo',
      }),
      assign('defragActiveFromLevel', false),
      assign('defragActiveFromPiosOrContinue', false),
      command('LevelLoad.StartLoading', { levelInfoFrom: 'levelInfo' }),
    ],
  };
}
