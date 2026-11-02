/**
 * One source-bounded AppDefragmentationMenu.UpdateDefragmentationMenu call.
 * SUPERHOT: MIND CONTROL DELETE build 20299547, decompiled C# lines 409-443.
 *
 * These two pure stages plan engine intentions, NOT an executable UI, run,
 * save, animation, or proof that Containers reaches this code.
 * Dispatch advancement, sample the run, then finalize and dispatch disk updates.
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
 * Capture interpolation inputs and plan the operations BEFORE sampling the run.
 * Dispatch these intents once, in order, before reading postAdvanceRun.
 */
export function planMcdDefragmentationAdvance(state) {
  record(state, 'state');
  if (typeof state.entryPoint !== 'string' || !state.entryPoint) {
    throw new TypeError('state.entryPoint must be a nonempty string');
  }
  bool(state.dontUpdateRun, 'state.dontUpdateRun');
  const defragSuperhot = bool(state.defragSuperhot, 'state.defragSuperhot');
  const currentDiskCell = finiteIndex(state.currentDiskCell, 'state.currentDiskCell');
  const shouldAdvance = !state.dontUpdateRun && state.entryPoint === MCD_DEFRAG_ENTRY.LEVEL;
  return {
    shouldAdvance,
    currentDiskCell,
    defragSuperhot,
    nextFlags: { allowReplays: true, movedToNextCell: true, dontUpdateRun: false },
    intents: [
      { kind: 'set', field: 'AllowReplays', value: true },
      ...(shouldAdvance ? [{ kind: 'call', method: 'CurrentRun.MoveToNextCell' }] : []),
      { kind: 'set', field: 'movedToNextCell', value: true },
      { kind: 'set', field: 'DontUpdateRun', value: false },
    ],
  };
}

/**
 * Finalize AFTER dispatching advance.intents and sampling CheckIfLastCell,
 * then GetDiskImageIndexForIndex(DiskImage.Length) or GetCurrentDiskCell.
 * Only the remaining disk-update intents are returned: no move or repeated read.
 * Neither stage executes intentions or reads Unity assets.
 */
export function finalizeMcdDefragmentationUpdate(advance, postAdvanceRun) {
  record(advance, 'advance');
  record(postAdvanceRun, 'postAdvanceRun');
  const from = finiteIndex(advance.currentDiskCell, 'advance.currentDiskCell');
  const defragSuperhot = bool(advance.defragSuperhot, 'advance.defragSuperhot');
  const last = bool(postAdvanceRun.isLastCell, 'postAdvanceRun.isLastCell');
  const target = last
    ? finiteIndex(postAdvanceRun.diskImageEndIndex, 'postAdvanceRun.diskImageEndIndex')
    : finiteIndex(postAdvanceRun.currentRunDiskCell, 'postAdvanceRun.currentRunDiskCell');
  const durationSeconds = defragSuperhot ? 1.25 : last ? 0.15 : 0.5;
  const totalSymbols = target - from;
  if (!Number.isSafeInteger(totalSymbols)) {
    throw new RangeError('native disk-cell difference cannot be represented as a safe integer');
  }
  return {
    nextFlags: { startUpdatingDisk: true, newDiskCell: target },
    interpolation: { totalSymbols, durationSeconds, source: 'Interpolator(duration, totalSymbols)' },
    intents: [
      { kind: 'set', field: 'NewDiskCell', value: target },
      { kind: 'set', field: 'StartUpdatingDisk', value: true },
      { kind: 'call', method: 'UpdateInterpolator' },
    ],
  };
}
