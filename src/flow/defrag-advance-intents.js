/**
 * One source-bounded AppDefragmentationMenu.UpdateDefragmentationMenu call.
 * SUPERHOT: MIND CONTROL DELETE build 20299547, decompiled C# lines 409-443.
 *
 * This is a pure plan of engine intentions, NOT an executable UI, run,
 * save, animation, or proof that Containers reaches this code.
 * `postAdvanceRun` MUST be observed after the optional MoveToNextCell call.
 * Source and limitations: docs/parity/flow.md.
 */
const finiteIndex = (value, key) => {
  if (!Number.isSafeInteger(value)) throw new TypeError(key + ' must be a safe integer');
  return value;
};
const bool = (value, key) => {
  if (typeof value !== 'boolean') throw new TypeError(key + ' must be an explicit boolean');
  return value;
};
const record = (value, key) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(key + ' must be a record');
  }
  return value;
};

export const MCD_DEFRAG_ENTRY = Object.freeze({ LEVEL: 'Level' });

/**
 * @param {object} state - current entry point, flags and disk interpolation origin
 * @param {object} postAdvanceRun - run-derived values AFTER optional advancement;
 *   this function never calls Unity's MoveToNextCell or reads game assets.
 * @returns {object} ordered intentions and a planned disk interpolation
 */
export function planMcdDefragmentationUpdate(state, postAdvanceRun) {
  record(state, 'state');
  record(postAdvanceRun, 'postAdvanceRun');
  if (typeof state.entryPoint !== 'string' || !state.entryPoint) {
    throw new TypeError('state.entryPoint must be a nonempty string');
  }
  bool(state.dontUpdateRun, 'state.dontUpdateRun');
  bool(state.defragSuperhot, 'state.defragSuperhot');
  const from = finiteIndex(state.currentDiskCell, 'state.currentDiskCell');
  const last = bool(postAdvanceRun.isLastCell, 'postAdvanceRun.isLastCell');
  const shouldAdvance = !state.dontUpdateRun && state.entryPoint === MCD_DEFRAG_ENTRY.LEVEL;
  const diskTargetMethod = last
    ? 'CurrentRun.GetDiskImageIndexForIndex(DiskImage.Length)'
    : 'CurrentRun.GetCurrentDiskCell';
  const target = last
    ? finiteIndex(postAdvanceRun.diskImageEndIndex, 'postAdvanceRun.diskImageEndIndex')
    : finiteIndex(postAdvanceRun.currentRunDiskCell, 'postAdvanceRun.currentRunDiskCell');
  const durationSeconds = state.defragSuperhot ? 1.25 : last ? 0.15 : 0.5;
  const totalSymbols = target - from;
  if (!Number.isSafeInteger(totalSymbols)) {
    throw new RangeError('native disk-cell difference cannot be represented as a safe integer');
  }
  const intents = [
    { kind: 'set', field: 'AllowReplays', value: true },
    ...(shouldAdvance ? [{ kind: 'call', method: 'CurrentRun.MoveToNextCell' }] : []),
    { kind: 'set', field: 'movedToNextCell', value: true },
    { kind: 'set', field: 'DontUpdateRun', value: false },
    { kind: 'call', method: 'CurrentRun.CheckIfLastCell' },
    { kind: 'call', method: diskTargetMethod },
    { kind: 'set', field: 'NewDiskCell', value: target },
    { kind: 'set', field: 'StartUpdatingDisk', value: true },
    { kind: 'call', method: 'UpdateInterpolator' },
  ];
  return {
    shouldAdvance,
    requiresPostAdvanceRunSnapshot: true,
    postAdvanceRunSnapshotStage: 'after optional MoveToNextCell',
    nextFlags: { allowReplays: true, movedToNextCell: true, dontUpdateRun: false,
      startUpdatingDisk: true, newDiskCell: target },
    interpolation: { totalSymbols, durationSeconds, source: 'Interpolator(duration, totalSymbols)' },
    intents,
  };
}
