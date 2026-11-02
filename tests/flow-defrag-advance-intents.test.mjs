import test from 'node:test';
import assert from 'node:assert/strict';
import { planMcdDefragmentationUpdate as plan } from '../src/flow/defrag-advance-intents.js';

const state = (override = {}) => ({ entryPoint: 'Level', dontUpdateRun: false,
  defragSuperhot: false, currentDiskCell: 10, ...override });
const run = (override = {}) => ({ isLastCell: false, currentRunDiskCell: 34,
  diskImageEndIndex: 100, ...override });
const methods = (result) => result.intents.filter(x => x.kind === 'call').map(x => x.method);

test('Level entry requests exactly one MoveToNextCell before reading target', () => {
  const result = plan(state(), run());
  assert.equal(result.shouldAdvance, true);
  assert.deepEqual(methods(result), ['CurrentRun.MoveToNextCell',
    'CurrentRun.CheckIfLastCell', 'CurrentRun.GetCurrentDiskCell', 'UpdateInterpolator']);
  assert.deepEqual(result.interpolation, { totalSymbols: 24, durationSeconds: 0.5,
    source: 'Interpolator(duration, totalSymbols)' });
  assert.equal(result.nextFlags.newDiskCell, 34);
});

test('DontUpdateRun suppresses only advancement; one-shot flag is then reset', () => {
  const result = plan(state({ dontUpdateRun: true }), run());
  assert.equal(result.shouldAdvance, false);
  assert.deepEqual(methods(result), ['CurrentRun.CheckIfLastCell',
    'CurrentRun.GetCurrentDiskCell', 'UpdateInterpolator']);
  assert.deepEqual(result.nextFlags, { allowReplays: true, movedToNextCell: true,
    dontUpdateRun: false, startUpdatingDisk: true, newDiskCell: 34 });
});

test('non-Level entry does not advance even when DontUpdateRun is false', () => {
  const result = plan(state({ entryPoint: 'Continue' }), run());
  assert.equal(result.shouldAdvance, false);
  assert.equal(methods(result).includes('CurrentRun.MoveToNextCell'), false);
});

test('last-cell case uses computed disk endpoint and shorter 0.15 s interpolation', () => {
  const result = plan(state(), run({ isLastCell: true }));
  assert.equal(result.nextFlags.newDiskCell, 100);
  assert.equal(result.interpolation.durationSeconds, 0.15);
  assert.deepEqual(methods(result).slice(-2), [
    'CurrentRun.GetDiskImageIndexForIndex(DiskImage.Length)', 'UpdateInterpolator']);
});

test('defragSuperhot takes precedence over last-cell short duration', () => {
  const result = plan(state({ defragSuperhot: true }), run({ isLastCell: true }));
  assert.equal(result.interpolation.durationSeconds, 1.25);
  assert.equal(result.interpolation.totalSymbols, 90);
});

test('normal defragSuperhot animation is 1.25 s even off last cell', () => {
  assert.equal(plan(state({ defragSuperhot: true }), run()).interpolation.durationSeconds, 1.25);
});

test('a backward target remains a signed symbol delta, not a fabricated clamp', () => {
  assert.equal(plan(state({ currentDiskCell: 40 }), run({ currentRunDiskCell: 30 }))
    .interpolation.totalSymbols, -10);
});

test('intent does not execute a save, level load, UI animation, or callback', () => {
  const result = plan(state(), run());
  assert.equal(result.requiresPostAdvanceRunSnapshot, true);
  assert.equal(result.postAdvanceRunSnapshotStage, 'after optional MoveToNextCell');
  assert.equal(JSON.stringify(result).includes('Save'), false);
  assert.equal(JSON.stringify(result).includes('StartLoading'), false);
  assert.equal(JSON.stringify(result).includes('AddViewOnTop'), false);
});

test('native-dependent values must be explicit; unused opposite endpoint may be absent', () => {
  assert.throws(() => plan(state({ dontUpdateRun: null }), run()), /dontUpdateRun/);
  assert.throws(() => plan(state({ defragSuperhot: null }), run()), /defragSuperhot/);
  assert.throws(() => plan(state(), run({ isLastCell: null })), /isLastCell/);
  assert.throws(() => plan(state(), run({ currentRunDiskCell: undefined })), /currentRunDiskCell/);
  assert.throws(() => plan(state(), run({ isLastCell: true, diskImageEndIndex: undefined })), /diskImageEndIndex/);
  assert.equal(plan(state(), { isLastCell: false, currentRunDiskCell: 30 }).nextFlags.newDiskCell, 30);
});

test('input objects are not mutated by the intent plan', () => {
  const a=Object.freeze(state()), b=Object.freeze(run());
  plan(a,b);
  assert.deepEqual(a,state());
  assert.deepEqual(b,run());
});
