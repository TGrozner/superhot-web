import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_EVENT as E, FLOW_PHASE as P, reduceFlow } from '../src/flow/state-machine.js';
import { createRoomScopedFlow, captureRoomScope, reduceRoomScopedFlow } from '../src/flow/room-scope.js';

const send = (session, type, data = {}, scope) => reduceRoomScopedFlow(session, { type, ...data }, scope);
const freshRun = (rules) => send(createRoomScopedFlow(rules), E.START);

test('room scope is an immutable Web producer token; menu is not an active room', () => {
  const menu = createRoomScopedFlow();
  assert.equal(menu.flow.phase, P.MENU);
  assert.equal(menu.generation, 0);
  assert.equal(Object.isFrozen(menu), true);
  assert.throws(() => captureRoomScope(menu), RangeError);
  const playing = send(menu, E.START);
  const scope = captureRoomScope(playing);
  assert.deepEqual(scope, { generation: 1, roomIndex: 0 });
  assert.equal(Object.isFrozen(scope), true);
  assert.equal(Object.isFrozen(playing.flow), true);
  assert.equal(Object.isFrozen(playing.rules), true);
});

test('current room damage/clear are delegated to reducer, pause/resume preserves lifetime', () => {
  const playing = freshRun();
  const origin = captureRoomScope(playing);
  const hurt = send(playing, E.DAMAGE, { amount: 1 }, origin);
  assert.equal(hurt.flow.health, 2);
  assert.equal(hurt.generation, playing.generation);
  const paused = send(hurt, E.PAUSE);
  assert.equal(paused.generation, hurt.generation);
  assert.deepEqual(captureRoomScope(paused), origin);
  assert.equal(send(paused, E.DAMAGE, { amount: 1 }, origin), paused);
  const resumed = send(paused, E.RESUME);
  const pending = send(resumed, E.ROOM_CLEARED, {}, origin);
  assert.equal(pending.flow.clearRemainingSeconds, 2);
  assert.equal(send(pending, E.ROOM_CLEARED, {}, origin), pending);
});

test('late callback from previous run cannot arm clear or damage restarted room zero', () => {
  const first = freshRun();
  const oldOrigin = captureRoomScope(first);
  const restarted = send(first, E.RESTART);
  assert.equal(restarted.flow.roomIndex, 0);
  assert.equal(restarted.generation, 2);
  assert.equal(send(restarted, E.ROOM_CLEARED, {}, oldOrigin), restarted);
  assert.equal(send(restarted, E.DAMAGE, { amount: 3 }, oldOrigin), restarted);
  const newOrigin = captureRoomScope(restarted);
  assert.notDeepEqual(newOrigin, oldOrigin);
  assert.equal(send(restarted, E.DAMAGE, { amount: 1 }, newOrigin).flow.health, 2);
});

test('late callbacks from previous room cannot affect successor; real ticks stay unscoped', () => {
  const first = freshRun();
  const oldOrigin = captureRoomScope(first);
  const pending = send(first, E.ROOM_CLEARED, {}, oldOrigin);
  const second = send(pending, E.TICK, { realSeconds: 2 });
  assert.equal(second.flow.roomIndex, 1);
  assert.equal(second.generation, first.generation + 1);
  assert.equal(send(second, E.ROOM_CLEARED, {}, oldOrigin), second);
  assert.equal(send(second, E.DAMAGE, { amount: 1 }, oldOrigin), second);
  const secondOrigin = captureRoomScope(second);
  assert.deepEqual(secondOrigin, { generation: 2, roomIndex: 1 });
  assert.equal(send(second, E.ROOM_CLEARED, {}, secondOrigin).flow.clearRemainingSeconds, 2);
});

test('death + new start invalidates old token; terminal win has no inferred checkpoint', () => {
  const first = freshRun({ roomCount: 1 });
  const origin = captureRoomScope(first);
  const dead = send(first, E.DAMAGE, { amount: 3 }, origin);
  assert.equal(dead.flow.phase, P.DEAD);
  assert.throws(() => captureRoomScope(dead), RangeError);
  const retried = send(dead, E.START);
  assert.equal(retried.generation, 2);
  assert.equal(send(retried, E.ROOM_CLEARED, {}, origin), retried);
  const pending = send(retried, E.ROOM_CLEARED, {}, captureRoomScope(retried));
  const won = send(pending, E.TICK, { realSeconds: 2 });
  assert.equal(won.flow.phase, P.WON);
  assert.throws(() => captureRoomScope(won), RangeError);
  assert.equal(send(won, E.START).flow.roomIndex, 0);
});

test('event scope must be explicit, finite, and only for room-local notifications', () => {
  const playing = freshRun();
  for (const invalid of [undefined, null, {}, { generation: NaN, roomIndex: 0 },
    { generation: 1.5, roomIndex: 0 }, { generation: 1, roomIndex: -1 }]) {
    assert.throws(() => send(playing, E.DAMAGE, {}, invalid), TypeError);
  }
  assert.throws(() => send(playing, E.ROOM_CLEARED), TypeError);
  assert.throws(() => send(playing, E.TICK, { realSeconds: 0.1 }, captureRoomScope(playing)), TypeError);
  assert.throws(() => send(playing, 'invented-native-event'), RangeError);
  assert.throws(() => send(playing, E.TICK, { realSeconds: Infinity }), RangeError);
  assert.throws(() => reduceRoomScopedFlow(null, { type: E.START }), TypeError);
  assert.throws(() => reduceRoomScopedFlow(playing, null), TypeError);
});

test('a scope is captured at producer birth, not at stale callback delivery', () => {
  const first = freshRun();
  const producerOrigin = captureRoomScope(first);
  const restarted = send(first, E.RESTART);
  // The unscoped reducer would accept the old callback on the restarted run.
  const unsafe = reduceFlow(restarted.flow, { type: E.ROOM_CLEARED }, restarted.rules);
  assert.equal(unsafe.clearRemainingSeconds, 2);
  assert.equal(send(restarted, E.ROOM_CLEARED, {}, producerOrigin).flow.clearRemainingSeconds, null);
  // Capturing a *new* scope at callback delivery defeats the guard by design.
  assert.equal(send(restarted, E.ROOM_CLEARED, {}, captureRoomScope(restarted)).flow.clearRemainingSeconds, 2);
});
