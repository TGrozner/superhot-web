import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_EVENT as E, FLOW_PHASE as P } from '../src/flow/state-machine.js';
import { traceFlowScenario } from '../src/flow/scenario-trace.js';

test('a dynamic getter cannot append a surprise event to the active replay', () => {
  const events = [{ type: E.START }];
  let reads = 0;
  events.push({
    get type() {
      reads += 1;
      events.push({ type: E.DAMAGE, amount: 3 });
      return E.TICK;
    },
    realSeconds: 0.5,
  });

  const run = traceFlowScenario(events);
  assert.equal(reads, 1);
  assert.equal(events.length, 3); // Caller-owned array was mutated.
  assert.equal(run.steps.length, 2); // Only two authored entries at invocation.
  assert.deepEqual(run.steps.map((step) => step.index), [0, 1]);
  assert.equal(run.final.phase, P.PLAYING);
  assert.equal(run.final.health, 3);
});

test('a dynamic getter cannot remove an already queued replay event', () => {
  const events = [
    { type: E.START },
    {
      get type() {
        events.pop();
        return E.TICK;
      },
      realSeconds: 0.5,
    },
    { type: E.DAMAGE, amount: 1 },
  ];

  const run = traceFlowScenario(events);
  assert.equal(events.length, 2);
  assert.equal(run.steps.length, 3);
  assert.equal(run.steps[2].event.type, E.DAMAGE);
  assert.equal(run.final.phase, P.PLAYING);
  assert.equal(run.final.health, 2);
});

test('ordinary event updates are still captured when consumed, not at replay start', () => {
  const events = [
    { type: E.START },
    {
      get type() {
        events[2].amount = 2;
        return E.TICK;
      },
      realSeconds: 0.1,
    },
    { type: E.DAMAGE, amount: 1 },
  ];

  const run = traceFlowScenario(events);
  assert.equal(run.steps.length, 3);
  assert.deepEqual(run.steps[2].event, { type: E.DAMAGE, amount: 2 });
  assert.equal(run.final.health, 1);
});
