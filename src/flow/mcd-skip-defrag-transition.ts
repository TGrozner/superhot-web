/**
 * SH-08: execute the *source-ordered* HandleSkippingDefrag continuation.
 *
 * Provenance: private MCD build 20299547, LevelFlowControl.cs:1038–1057,
 * research issue #66/artifact 13135917213. This reproduces the ordering of
 * calls into injected services, not the Unity save/scene/UI implementations.
 * A web kill quota must NEVER be passed off as the native callback receipt.
 */
export interface MCDSkipDefragReceipt {
  /** Identity of the scene whose source-qualified ending invoked the callback. */
  readonly source: unknown;
  /** Comes from the native-source-validated deferred ending branch, not the HUD. */
  readonly callback: unknown;
  /** Supplied from CurrentRun, not inferred from the Web encounter quota. */
  readonly skipDefragBetweenLevels: unknown;
}

/** The current run's authoritative cell operations; no synthetic cell list. */
export interface MCDSkipDefragRun {
  moveToNextCell(): void;
  checkIfLastCell(): boolean;
  checkIfCurrentCellIsShop(): boolean;
  save(): void;
  getNextLevel(): unknown;
}

/** Host services that SH-05 must source and wire; no DOM or clock here. */
export interface MCDSkipDefragServices {
  readonly currentRun: MCDSkipDefragRun;
  setNewRunUnlocked(value: true): void;
  makeScreenshot(): void;
  forceScreenshotOnScreen(): void;
  riseOnWin(): void;
  getLevelBySceneFileName(name: 'SHMenu'): unknown;
  startLoading(level: unknown): void;
}

export interface MCDSkipDefragResult {
  readonly branch: 'next-level' | 'completed-run';
  readonly cellsAdvanced: number;
  readonly destination: 'next-run-cell' | 'SHMenu';
  /** Static call ordering only; never a claim that Unity ran this route. */
  readonly nativeParity: 'STATIC_SOURCE_ONLY';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertReceipt(value: unknown): asserts value is MCDSkipDefragReceipt {
  if (!isRecord(value)) throw new TypeError('native callback receipt required');
  const source = value['source'];
  if (!isRecord(source) || source['sceneBuildIndex'] !== 10 ||
      source['serializedOwner'] !== 'level10' ||
      typeof source['scenePath'] !== 'string' ||
      !/(?:^|[\\/])SHRL_Dojo2\.unity$/i.test(source['scenePath'])) {
    throw new RangeError('expected SHRL_Dojo2/build10/level10 source');
  }
  if (value['callback'] !== 'SkipDefragAndAdvanceRun' ||
      value['skipDefragBetweenLevels'] !== true) {
    throw new RangeError('HandleSkippingDefrag requires the native skip-defrag callback');
  }
}

function assertServices(value: unknown): asserts value is MCDSkipDefragServices {
  if (!isRecord(value) || !isRecord(value['currentRun'])) {
    throw new TypeError('authoritative currentRun services required');
  }
  const run = value['currentRun'];
  for (const method of ['moveToNextCell', 'checkIfLastCell',
    'checkIfCurrentCellIsShop', 'save', 'getNextLevel']) {
    if (typeof run[method] !== 'function') throw new TypeError('currentRun.' + method + ' required');
  }
  for (const method of ['setNewRunUnlocked', 'makeScreenshot',
    'forceScreenshotOnScreen', 'riseOnWin', 'getLevelBySceneFileName', 'startLoading']) {
    if (typeof value[method] !== 'function') throw new TypeError(method + ' required');
  }
}

function nativeBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(label + ' must return boolean');
  return value;
}

function level(value: unknown, label: string): unknown {
  if (value === null || value === undefined) {
    throw new TypeError(label + ' returned no level; refusing fabricated scene');
  }
  return value;
}

/**
 * Invoke ONCE when the deferred SkipDefragAndAdvanceRun callback actually fires.
 * Mirrors native do/while (including at least one MoveToNextCell), then Save,
 * then load next level OR unlock, screenshot, OnWin, load SHMenu in that order.
 * Host must own run state, persistence, image reveal, event bus and loading.
 * The method has side effects; do not call speculatively or on every frame.
 */
export function executeMcdSkipDefragTransition(
  receipt: Readonly<MCDSkipDefragReceipt>,
  services: Readonly<MCDSkipDefragServices>,
): Readonly<MCDSkipDefragResult> {
  assertReceipt(receipt);
  assertServices(services);
  const run = services.currentRun;
  let cellsAdvanced = 0;
  // The original code has no fixed maximum; the authoritative run owns its
  // bounds and must reject an impossible MoveToNextCell rather than wrapping.
  do {
    run.moveToNextCell();
    cellsAdvanced += 1;
  } while (!nativeBoolean(run.checkIfLastCell(), 'CheckIfLastCell') &&
           nativeBoolean(run.checkIfCurrentCellIsShop(), 'CheckIfCurrentCellIsShop'));
  run.save();
  if (!nativeBoolean(run.checkIfLastCell(), 'CheckIfLastCell')) {
    services.startLoading(level(run.getNextLevel(), 'GetNextLevel'));
    return Object.freeze({
      branch: 'next-level', cellsAdvanced, destination: 'next-run-cell',
      nativeParity: 'STATIC_SOURCE_ONLY',
    });
  }
  services.setNewRunUnlocked(true);
  services.makeScreenshot();
  services.forceScreenshotOnScreen();
  services.riseOnWin();
  services.startLoading(level(services.getLevelBySceneFileName('SHMenu'), 'GetLevelBySceneFileName'));
  return Object.freeze({
    branch: 'completed-run', cellsAdvanced, destination: 'SHMenu',
    nativeParity: 'STATIC_SOURCE_ONLY',
  });
}
