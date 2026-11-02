import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_EVENT as E, FLOW_PHASE as P } from '../src/flow/state-machine.js';
import { traceFlowScenario } from '../src/flow/scenario-trace.js';

test('control events must not read unrelated payload getters', () => {
  let amountReads = 0;
  let secondsReads = 0;
  const start = {
    type: E.START,
    get amount() { amountReads += 1; throw new Error('irrelevant amount read'); },
    get realSeconds() { secondsReads += 1; throw new Error('irrelevant timer read'); },
  };
  const run = traceFlowScenario([start]);
  assert.equal(run.final.phase, P.PLAYING);
  assert.deepEqual(run.steps[0].event, { type: E.START });
  assert.equal(amountReads, 0);
  assert.equal(secondsReads, 0);
});

test('damage must ignore unrelated realSeconds but preserve inherited amount', () => {
  const event = Object.create({ amount: 2 });
  event.type = E.DAMAGE;
  Object.defineProperty(event, 'realSeconds', {
    get() { throw new Error('unrelated timer read'); },
  });
  const run = traceFlowScenario([{ type: E.START }, event]);
  assert.equal(run.final.health, 1);
  assert.deepEqual(run.steps[1].event, { type: E.DAMAGE, amount: 2 });
});

test('tick must ignore unrelated damage amount but preserve inherited seconds', () => {
  const event = Object.create({ realSeconds: 2 });
  event.type = E.TICK;
  Object.defineProperty(event, 'amount', {
    get() { throw new Error('unrelated damage read'); },
  });
  const run = traceFlowScenario([{ type: E.START }, { type: E.ROOM_CLEARED }, event]);
  assert.equal(run.final.roomIndex, 1);
  assert.deepEqual(run.steps[2].event, { type: E.TICK, realSeconds: 2 });
});

test('irrelevant fields cannot produce invented side effects in diagnostics', () => {
  let extraReads = 0;
  const cleared = { type: E.ROOM_CLEARED,
    get amount() { extraReads += 1; return 999; },
    get realSeconds() { extraReads += 1; return -1; },
  };
  const run = traceFlowScenario([{ type: E.START }, cleared]);
  assert.equal(run.final.clearRemainingSeconds, 2);
  assert.deepEqual(run.steps[1].event, { type: E.ROOM_CLEARED });
  assert.equal(extraReads, 0);
});
