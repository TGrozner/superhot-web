import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_EVENT as E, FLOW_PHASE as P } from '../src/flow/state-machine.js';
import { createRoomScopedFlow, captureRoomScope, reduceRoomScopedFlow } from '../src/flow/room-scope.js';

const active = () => reduceRoomScopedFlow(createRoomScopedFlow(), { type: E.START });

test('global guard and reducer must consume one identical type getter value', () => {
  let typeReads = 0;
  const event = {
    get type() { return ++typeReads === 1 ? E.PAUSE : E.DAMAGE; },
    amount: 1,
  };
  const session = active();
  const next = reduceRoomScopedFlow(session, event);
  assert.equal(typeReads, 1);
  assert.equal(next.flow.phase, P.PAUSED);
  assert.equal(next.flow.health, 3);
  assert.equal(next.generation, session.generation);
});

test('scoped damage cannot become an unrestricted restart after validation', () => {
  let typeReads = 0;
  const session = active();
  const scope = captureRoomScope(session);
  const event = {
    get type() { return ++typeReads === 1 ? E.DAMAGE : E.RESTART; },
    amount: 1,
  };
  const next = reduceRoomScopedFlow(session, event, scope);
  assert.equal(typeReads, 1);
  assert.equal(next.flow.phase, P.PLAYING);
  assert.equal(next.flow.health, 2);
  assert.equal(next.generation, session.generation);
});

test('TICK must not increment room generation because of a later type read', () => {
  let typeReads = 0;
  const session = active();
  const event = {
    get type() { return ++typeReads <= 2 ? E.TICK : E.RESTART; },
    realSeconds: 0.5,
  };
  const next = reduceRoomScopedFlow(session, event);
  assert.equal(typeReads, 1);
  assert.equal(next.generation, session.generation);
  assert.equal(next.flow.bannerRemainingSeconds, 1.7000000000000002);
});

test('START must not re-read a getter that throws after its first access', () => {
  let reads = 0;
  const next = reduceRoomScopedFlow(createRoomScopedFlow(), {
    get type() {
      if (++reads > 1) throw new Error('unexpected second type read');
      return E.START;
    },
  });
  assert.equal(reads, 1);
  assert.equal(next.flow.phase, P.PLAYING);
  assert.equal(next.generation, 1);
});

test('only event-specific inherited payload is read; unrelated getters are ignored', () => {
  const session = active();
  const damage = Object.assign(Object.create({ amount: 2 }), { type: E.DAMAGE });
  Object.defineProperty(damage, 'realSeconds', {
    get() { throw new Error('irrelevant clock getter'); },
  });
  const injured = reduceRoomScopedFlow(session, damage, captureRoomScope(session));
  assert.equal(injured.flow.health, 1);

  const tick = Object.assign(Object.create({ realSeconds: 0.5 }), { type: E.TICK });
  Object.defineProperty(tick, 'amount', {
    get() { throw new Error('irrelevant damage getter'); },
  });
  const afterTick = reduceRoomScopedFlow(injured, tick);
  assert.equal(afterTick.flow.bannerRemainingSeconds, 1.7000000000000002);
  assert.equal(afterTick.generation, injured.generation);
});

test('stale producer scopes remain invalid after a restart', () => {
  const first = active();
  const oldScope = captureRoomScope(first);
  const restarted = reduceRoomScopedFlow(first, { type: E.RESTART });
  let reads = 0;
  const stale = { get type() { reads += 1; return E.DAMAGE; }, amount: 2 };
  assert.equal(reduceRoomScopedFlow(restarted, stale, oldScope), restarted);
  assert.equal(reads, 1);
});
