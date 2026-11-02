import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOW_EVENT as E, FLOW_PHASE as PHASE, PROTOTYPE_FLOW_RULES,
  createFlowRules, createFlowState, reduceFlow,
} from '../src/flow/state-machine.js';

const rules = createFlowRules();
const emit = (state, type, data = {}) => reduceFlow(state, { type, ...data }, rules);
const started = () => emit(createFlowState(rules), E.START);
const clearAndTick = (s, seconds = rules.clearDelaySeconds) => emit(emit(s, E.ROOM_CLEARED), E.TICK, { realSeconds: seconds });

test('prototype defaults are configuration, not MCD parity', () => {
  assert.deepEqual(PROTOTYPE_FLOW_RULES, { roomCount: 3, maxHealth: 3, healPerRoom: 1, clearDelaySeconds: 2, bannerSeconds: 2.2 });
  assert.equal(Object.isFrozen(rules), true);
  assert.throws(() => createFlowRules({ roomCount: 0 }), RangeError);
  assert.throws(() => createFlowRules({ roomCount: 1.5 }), RangeError);
  assert.throws(() => createFlowRules({ clearDelaySeconds: Number.POSITIVE_INFINITY }), RangeError);
  assert.throws(() => createFlowRules({ maxHealth: -1 }), RangeError);
  assert.throws(() => createFlowRules({ healPerRoom: -1 }), RangeError);
});

test('start/restart reset every room-flow field, including after death or win', () => {
  const menu = createFlowState(rules);
  assert.equal(menu.phase, PHASE.MENU);
  assert.equal(menu.health, 3);
  const play = emit(menu, E.START);
  assert.deepEqual(play, { phase: PHASE.PLAYING, roomIndex: 0, health: 3,
    clearRemainingSeconds: null, bannerRemainingSeconds: 2.2 });
  assert.equal(emit(play, E.START), play);
  const dead = emit(play, E.DAMAGE, { amount: 3 });
  assert.equal(dead.phase, PHASE.DEAD);
  assert.deepEqual(emit(dead, E.START), play);
  assert.deepEqual(emit(dead, E.RESTART), play);
  const won = clearAndTick(clearAndTick(clearAndTick(play)));
  assert.equal(won.phase, PHASE.WON);
  assert.deepEqual(emit(won, E.START), play);
});

test('pause preserves pending room-clear countdown, and resume continues', () => {
  const pending = emit(started(), E.ROOM_CLEARED);
  const paused = emit(pending, E.PAUSE);
  assert.equal(paused.phase, PHASE.PAUSED);
  assert.equal(paused.clearRemainingSeconds, 2);
  assert.equal(emit(paused, E.TICK, { realSeconds: 100 }), paused);
  assert.equal(emit(paused, E.ROOM_CLEARED), paused);
  const resumed = emit(paused, E.RESUME);
  const next = emit(resumed, E.TICK, { realSeconds: 2 });
  assert.equal(next.phase, PHASE.PLAYING);
  assert.equal(next.roomIndex, 1);
  assert.equal(next.clearRemainingSeconds, null);
});

test('room-clear is idempotent, waits real seconds and advances by one room', () => {
  const first = started();
  const pending = emit(first, E.ROOM_CLEARED);
  assert.equal(emit(pending, E.ROOM_CLEARED), pending);
  const halfway = emit(pending, E.TICK, { realSeconds: .5 });
  assert.equal(halfway.clearRemainingSeconds, 1.5);
  assert.equal(halfway.roomIndex, 0);
  const next = emit(halfway, E.TICK, { realSeconds: 5 });
  assert.equal(next.roomIndex, 1);
  assert.equal(next.bannerRemainingSeconds, 2.2);
  assert.equal(next.clearRemainingSeconds, null);
  assert.equal(emit(next, E.TICK, { realSeconds: 100 }).roomIndex, 1);
});

test('inter-room heal is capped, but no checkpoint is invented', () => {
  const slightlyHurt = emit(started(), E.DAMAGE);
  const next = clearAndTick(slightlyHurt);
  assert.equal(next.roomIndex, 1);
  assert.equal(next.health, 3);
  const hurt = emit(next, E.DAMAGE, { amount: 2 });
  const third = clearAndTick(hurt);
  assert.equal(third.health, 2);
  assert.equal(third.roomIndex, 2);
  assert.equal(emit(third, E.RESTART).roomIndex, 0);
});

test('lethal damage wins over an already pending room transition', () => {
  const pending = emit(started(), E.ROOM_CLEARED);
  const dead = emit(pending, E.DAMAGE, { amount: 3 });
  assert.equal(dead.phase, PHASE.DEAD);
  assert.equal(dead.health, 0);
  assert.equal(dead.clearRemainingSeconds, null);
  assert.equal(emit(dead, E.TICK, { realSeconds: 100 }), dead);
});

test('roomCount=1 wins after delay; other terminal events are ignored', () => {
  const single = createFlowRules({ roomCount: 1, clearDelaySeconds: 0 });
  const play = reduceFlow(createFlowState(single), { type: E.START }, single);
  const pending = reduceFlow(play, { type: E.ROOM_CLEARED }, single);
  assert.equal(pending.phase, PHASE.PLAYING);
  const won = reduceFlow(pending, { type: E.TICK, realSeconds: 0.01 }, single);
  assert.equal(won.phase, PHASE.WON);
  assert.equal(reduceFlow(won, { type: E.PAUSE }, single), won);
  assert.equal(reduceFlow(won, { type: E.DAMAGE }, single), won);
});

test('banner counts real seconds, freezes when paused and never goes negative', () => {
  const play = started();
  const half = emit(play, E.TICK, { realSeconds: 1.2 });
  assert.ok(Math.abs(half.bannerRemainingSeconds - 1) < 1e-12);
  assert.equal(emit(half, E.TICK, { realSeconds: 50 }).bannerRemainingSeconds, 0);
  assert.equal(emit(play, E.TICK, { realSeconds: 0 }), play);
  assert.equal(emit(emit(play, E.PAUSE), E.TICK, { realSeconds: 9 }).bannerRemainingSeconds, 2.2);
});

test('invalid TICK, damage and event types never silently affect state', () => {
  const play = started();
  for (const realSeconds of [-1, NaN, Infinity, undefined]) {
    assert.throws(() => emit(play, E.TICK, { realSeconds }), RangeError);
  }
  for (const amount of [0, -1, 1.2, Infinity]) {
    assert.throws(() => emit(play, E.DAMAGE, { amount }), RangeError);
  }
  assert.throws(() => emit(play, 'MCD_UNKNOWN_TRANSITION'), RangeError);
  assert.throws(() => reduceFlow(null, { type: E.START }), TypeError);
  assert.throws(() => reduceFlow(play, null), TypeError);
  assert.equal(Object.isFrozen(play), true);
});
