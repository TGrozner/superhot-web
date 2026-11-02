import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_EVENT as E, FLOW_PHASE as P } from '../src/flow/state-machine.js';
import { traceFlowScenario } from '../src/flow/scenario-trace.js';

const ev = (type, options = {}) => ({ type, ...options });

test('empty scenario remains on menu, without inventing a saved checkpoint', () => {
  const run = traceFlowScenario([]);
  assert.equal(run.initial.phase, P.MENU);
  assert.equal(run.final, run.initial);
  assert.deepEqual(run.steps, []);
  assert.equal(Object.isFrozen(run), true);
  assert.equal(Object.isFrozen(run.steps), true);
});

test('three-room Web baseline records each level transition and terminal win', () => {
  const run = traceFlowScenario([
    ev(E.START), ev(E.ROOM_CLEARED), ev(E.TICK, { realSeconds: 2 }),
    ev(E.DAMAGE, { amount: 2 }),
    ev(E.ROOM_CLEARED), ev(E.TICK, { realSeconds: 2 }),
    ev(E.ROOM_CLEARED), ev(E.TICK, { realSeconds: 2 }),
  ]);
  assert.equal(run.final.phase, P.WON);
  assert.equal(run.final.roomIndex, 2);
  assert.equal(run.final.health, 2);
  assert.deepEqual(run.steps.filter((step) => step.changedFields.includes('roomIndex')).map((step) => step.after.roomIndex), [1, 2]);
  assert.equal(run.steps.at(-1).changedFields.includes('phase'), true);
  assert.equal(run.steps.at(-1).after.phase, P.WON);
});

test('pause freezes pending clear and banner; duplicate clear has no side effect', () => {
  const run = traceFlowScenario([
    ev(E.START), ev(E.ROOM_CLEARED), ev(E.ROOM_CLEARED),
    ev(E.PAUSE), ev(E.TICK, { realSeconds: 500 }), ev(E.RESUME),
    ev(E.TICK, { realSeconds: 2 }),
  ]);
  assert.equal(run.steps[2].changed, false);
  assert.equal(run.steps[4].changed, false);
  assert.equal(run.steps[4].before, run.steps[4].after);
  assert.equal(run.steps[4].after.clearRemainingSeconds, 2);
  assert.equal(run.final.roomIndex, 1);
});

test('lethal damage cancels a pending clear, and restart begins a fresh run', () => {
  const run = traceFlowScenario([
    ev(E.START), ev(E.ROOM_CLEARED), ev(E.DAMAGE, { amount: 3 }),
    ev(E.TICK, { realSeconds: 10 }), ev(E.RESTART),
  ]);
  assert.equal(run.steps[2].after.phase, P.DEAD);
  assert.equal(run.steps[2].after.clearRemainingSeconds, null);
  assert.equal(run.steps[3].changed, false);
  assert.equal(run.final.phase, P.PLAYING);
  assert.equal(run.final.health, 3);
  assert.equal(run.final.roomIndex, 0);
});

test('snapshots are immutable and do not retain mutable event objects', () => {
  const firstEvent = ev(E.START);
  const tickEvent = ev(E.TICK, { realSeconds: 0.3, metadata: { unsafe: true } });
  const run = traceFlowScenario([firstEvent, tickEvent]);
  tickEvent.realSeconds = 999;
  firstEvent.type = E.RESTART;
  assert.deepEqual(run.steps[0].event, { type: E.START });
  assert.deepEqual(run.steps[1].event, { type: E.TICK, realSeconds: 0.3 });
  assert.equal(Object.isFrozen(run.steps[1].event), true);
  assert.equal(Object.isFrozen(run.steps[1].changedFields), true);
  assert.equal(Object.isFrozen(run.steps[1].after), true);
});

test('invalid scenario input fails instead of reporting fictional parity', () => {
  assert.throws(() => traceFlowScenario(null), TypeError);
  assert.throws(() => traceFlowScenario([null]), TypeError);
  assert.throws(() => traceFlowScenario([ev(E.TICK, { realSeconds: -1 })]), RangeError);
  assert.throws(() => traceFlowScenario([ev('unknown')]), RangeError);
  assert.throws(() => traceFlowScenario([], { roomCount: 0 }), RangeError);
});

test('diagnostic event must equal the exact getter values consumed by the reducer', () => {
  let typeReads = 0;
  let amountReads = 0;
  const unstableEvent = {
    get type() {
      typeReads += 1;
      return typeReads === 1 ? E.DAMAGE : E.ROOM_CLEARED;
    },
    get amount() {
      amountReads += 1;
      return amountReads === 1 ? 3 : 1;
    },
  };

  const run = traceFlowScenario([ev(E.START), unstableEvent]);
  assert.equal(run.final.phase, P.DEAD);
  assert.deepEqual(run.steps[1].event, { type: E.DAMAGE, amount: 3 });
  assert.equal(run.steps[1].after.health, 0);
  assert.equal(typeReads, 1);
  assert.equal(amountReads, 1);
});

test('trace retains inherited event payload actually consumed by the Web reducer', () => {
  const inheritedTick = Object.assign(Object.create({ realSeconds: 2 }), { type: E.TICK });
  const run = traceFlowScenario([
    ev(E.START), ev(E.ROOM_CLEARED), inheritedTick,
  ]);
  assert.equal(run.final.roomIndex, 1);
  assert.deepEqual(run.steps[2].event, { type: E.TICK, realSeconds: 2 });
  assert.equal(Object.isFrozen(run.steps[2].event), true);
});
