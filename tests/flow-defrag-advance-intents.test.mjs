import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planMcdDefragmentationAdvance as advance,
  finalizeMcdDefragmentationUpdate as finalize,
} from '../src/flow/defrag-advance-intents.js';
import { isMcdLevelClear } from '../src/flow/containers-gates.js';
import { planMcdProgressEndingInvocation } from '../src/flow/ending-intents.js';

const state = (override = {}) => ({ entryPoint: 'Level', dontUpdateRun: false,
  defragSuperhot: false, currentDiskCell: 10, ...override });
const run = (override = {}) => ({ isLastCell: false, currentRunDiskCell: 34,
  diskImageEndIndex: 100, ...override });
const methods = (result) => result.intents.filter(x => x.kind === 'call').map(x => x.method);
const plan = (input, snapshot) => finalize(advance(input), snapshot);

test('Level entry plans one advancement, while finalization only updates the disk', () => {
  const preparation = advance(state());
  assert.equal(preparation.shouldAdvance, true);
  assert.deepEqual(methods(preparation), ['CurrentRun.MoveToNextCell']);
  const result = finalize(preparation, run());
  assert.deepEqual(methods(result), ['UpdateInterpolator']);
  assert.deepEqual(result.interpolation, { totalSymbols: 24, durationSeconds: 0.5,
    source: 'Interpolator(duration, totalSymbols)' });
  assert.equal(result.nextFlags.newDiskCell, 34);
});

test('DontUpdateRun suppresses only advancement; one-shot flag is then reset', () => {
  const preparation = advance(state({ dontUpdateRun: true }));
  assert.equal(preparation.shouldAdvance, false);
  assert.deepEqual(methods(preparation), []);
  assert.deepEqual(preparation.nextFlags, { allowReplays: true, movedToNextCell: true,
    dontUpdateRun: false });
  assert.deepEqual(finalize(preparation, run()).nextFlags,
    { startUpdatingDisk: true, newDiskCell: 34 });
});

test('non-Level entry does not advance even when DontUpdateRun is false', () => {
  const preparation = advance(state({ entryPoint: 'Continue' }));
  assert.equal(preparation.shouldAdvance, false);
  assert.deepEqual(methods(preparation), []);
  assert.deepEqual(methods(finalize(preparation, run())), ['UpdateInterpolator']);
});

test('last-cell case uses computed disk endpoint and shorter 0.15 s interpolation', () => {
  const result = plan(state(), run({ isLastCell: true }));
  assert.equal(result.nextFlags.newDiskCell, 100);
  assert.equal(result.interpolation.durationSeconds, 0.15);
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

test('native-dependent values must be explicit; unused opposite endpoint may be absent', () => {
  assert.throws(() => advance(state({ dontUpdateRun: null })), /dontUpdateRun/);
  assert.throws(() => advance(state({ defragSuperhot: null })), /defragSuperhot/);
  assert.throws(() => plan(state(), run({ isLastCell: null })), /isLastCell/);
  assert.throws(() => plan(state(), run({ currentRunDiskCell: undefined })), /currentRunDiskCell/);
  assert.throws(() => plan(state(), run({ isLastCell: true, diskImageEndIndex: undefined })), /diskImageEndIndex/);
  assert.equal(plan(state(), { isLastCell: false, currentRunDiskCell: 30 }).nextFlags.newDiskCell, 30);
  assert.equal(plan(state(), { isLastCell: true, diskImageEndIndex: 100 }).nextFlags.newDiskCell, 100);
  assert.throws(() => plan(state({ currentDiskCell: -Number.MAX_SAFE_INTEGER }),
    run({ currentRunDiskCell: Number.MAX_SAFE_INTEGER })), /difference/);
});

test('both stages leave input objects unchanged and capture the interpolation origin', () => {
  const a = Object.freeze(state()), b = Object.freeze(run());
  const preparation = Object.freeze(advance(a));
  const intents = structuredClone(preparation.intents);
  finalize(preparation, b);
  assert.deepEqual(a, state());
  assert.deepEqual(b, run());
  assert.deepEqual(preparation.intents, intents);
  const mutable = state();
  const captured = advance(mutable);
  mutable.currentDiskCell = 999;
  mutable.defragSuperhot = true;
  assert.deepEqual(finalize(captured, b).interpolation, {
    totalSymbols: 24, durationSeconds: 0.5, source: 'Interpolator(duration, totalSymbols)',
  });
});

for (const entryPoint of ['Level', 'Continue']) {
  for (const dontUpdateRun of [false, true]) {
    for (const last of [false, true]) {
      for (const defragSuperhot of [false, true]) {
        test(`staged consumer: ${entryPoint}, skip=${dontUpdateRun}, last=${last}, superhot=${defragSuperhot}`, () => {
          // An authored consumer, not a Unity runtime or Containers observation.
          let cell = 1;
          let moves = 0;
          let interpolationCalls = 0;
          const trace = [];
          const flags = {};
          const expectedMoves = entryPoint === 'Level' && !dontUpdateRun ? 1 : 0;
          const expectedCell = cell + expectedMoves;
          const lastCell = last ? expectedCell : expectedCell + 1;
          const diskCells = [10, 34, 58, 82];
          const expectedTarget = last ? 100 : diskCells[expectedCell];
          const dispatch = (intents) => {
            for (const intent of intents) {
              if (intent.kind === 'set') {
                trace.push(intent.field);
                flags[intent.field] = intent.value;
              } else {
                trace.push(intent.method);
                if (intent.method === 'CurrentRun.MoveToNextCell') {
                  cell += 1;
                  moves += 1;
                } else if (intent.method === 'UpdateInterpolator') {
                  assert.equal(flags.NewDiskCell, expectedTarget);
                  assert.equal(flags.StartUpdatingDisk, true);
                  interpolationCalls += 1;
                } else {
                  assert.fail(`unexpected dispatched call: ${intent.method}`);
                }
              }
            }
          };
          const preparation = advance(state({ entryPoint, dontUpdateRun, defragSuperhot }));
          assert.equal(cell, 1);
          dispatch(preparation.intents);
          trace.push('CurrentRun.CheckIfLastCell');
          const snapshot = { isLastCell: cell === lastCell };
          if (snapshot.isLastCell) {
            trace.push('CurrentRun.GetDiskImageIndexForIndex(DiskImage.Length)');
            snapshot.diskImageEndIndex = 100;
          } else {
            trace.push('CurrentRun.GetCurrentDiskCell');
            snapshot.currentRunDiskCell = diskCells[cell];
          }
          const result = finalize(preparation, snapshot);
          dispatch(result.intents);

          assert.equal(moves, expectedMoves);
          assert.equal(cell, expectedCell);
          assert.equal(interpolationCalls, 1);
          assert.equal(result.nextFlags.newDiskCell, expectedTarget);
          assert.deepEqual(result.interpolation, {
            totalSymbols: expectedTarget - 10,
            durationSeconds: defragSuperhot ? 1.25 : last ? 0.15 : 0.5,
            source: 'Interpolator(duration, totalSymbols)',
          });
          assert.deepEqual(flags, {
            AllowReplays: true, movedToNextCell: true, DontUpdateRun: false,
            NewDiskCell: expectedTarget, StartUpdatingDisk: true,
          });
          assert.deepEqual(trace, [
            'AllowReplays', ...(expectedMoves ? ['CurrentRun.MoveToNextCell'] : []),
            'movedToNextCell', 'DontUpdateRun', 'CurrentRun.CheckIfLastCell',
            last ? 'CurrentRun.GetDiskImageIndexForIndex(DiskImage.Length)' : 'CurrentRun.GetCurrentDiskCell',
            'NewDiskCell', 'StartUpdatingDisk', 'UpdateInterpolator',
          ]);
        });
      }
    }
  }
}


test('synthetic vertical contract: quota clear -> deferred defrag intent -> Level cell advance', () => {
  // This composes *authored predicates*; it does not execute Unity callbacks,
  // read a real Containers run, or measure visible native UI.
  const clear = isMcdLevelClear({
    gameType: 'RUN_LEVEL', allNeededEnemyKilled: true,
    playerDead: false, winOnDeath: false,
  });
  assert.equal(clear, true);
  assert.equal(isMcdLevelClear({
    gameType: 'RUN_LEVEL', allNeededEnemyKilled: false,
    playerDead: false, winOnDeath: false,
  }), false);

  const ending = planMcdProgressEndingInvocation({
    endSHAnimation: true, startReadingInput: false, inputRead: true,
    startSuperAnimation: false, effectStarted: false,
    replayEnded: true, levelEnded: false,
  }, {
    blockReplays: false, finishWithoutReplay: false,
    tutorialRun: false, endRunId: false, replayManagerPlayingReplay: false,
    errorPunchStopped: false, replayPlayerInReplay: false,
    acceptedFinishButton: false, isLastRunLevel: false,
    skipSuperTextAfterLevel: false, skipDefragBetweenLevels: false,
  });
  const deferred = ending.effects.filter(effect => effect.type === 'enqueue');
  assert.equal(deferred.length, 1);
  assert.equal(deferred[0].callback, 'OpenDefragmentationMenu');
  assert.equal(deferred[0].timebase, 'UNVERIFIED');

  // Only after the external callback opens the menu can advancement be
  // dispatched; then the post-advance snapshot can finalize the disk update.
  const preparation = advance(state());
  assert.equal(preparation.shouldAdvance, true);
  assert.deepEqual(methods(preparation), ['CurrentRun.MoveToNextCell']);
  const disk = finalize(preparation, run());
  assert.deepEqual(methods(disk), ['UpdateInterpolator']);
  assert.deepEqual(disk.interpolation, {
    totalSymbols: 24, durationSeconds: 0.5,
    source: 'Interpolator(duration, totalSymbols)',
  });
});
