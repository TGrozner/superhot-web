import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_EVENT as E, FLOW_PHASE as P } from '../src/flow/state-machine.js';
import { createRoomScopedFlow, captureRoomScope, reduceRoomScopedFlow } from '../src/flow/room-scope.js';

const send = (session, type, payload = {}, scope) => reduceRoomScopedFlow(session, { type, ...payload }, scope);
const start = () => send(createRoomScopedFlow(), E.START);

test('independent Web sessions with equal public counters cannot exchange room-local events', () => {
  const alice = start();
  const bob = start();
  const aliceOrigin = captureRoomScope(alice);
  const bobOrigin = captureRoomScope(bob);
  assert.deepEqual(aliceOrigin, bobOrigin); // Both publicly read { generation: 1, roomIndex: 0 }.
  assert.equal(send(alice, E.DAMAGE, { amount: 2 }, bobOrigin), alice);
  assert.equal(send(bob, E.ROOM_CLEARED, {}, aliceOrigin), bob);
  assert.equal(alice.flow.health, 3);
  assert.equal(bob.flow.clearRemainingSeconds, null);
  assert.equal(send(alice, E.DAMAGE, { amount: 2 }, aliceOrigin).flow.health, 1);
  assert.equal(send(bob, E.ROOM_CLEARED, {}, bobOrigin).flow.clearRemainingSeconds, 2);
});

test('a process-local session origin survives immutable Web flow updates and pause', () => {
  const first = start();
  const origin = captureRoomScope(first);
  const hurt = send(first, E.DAMAGE, { amount: 1 }, origin);
  const paused = send(hurt, E.PAUSE);
  assert.equal(paused.flow.phase, P.PAUSED);
  const resumed = send(paused, E.RESUME);
  assert.equal(send(resumed, E.DAMAGE, { amount: 1 }, origin).flow.health, 1);
  const armed = send(resumed, E.ROOM_CLEARED, {}, origin);
  const nextRoom = send(armed, E.TICK, { realSeconds: 2 });
  assert.equal(nextRoom.flow.roomIndex, 1);
  assert.equal(send(nextRoom, E.ROOM_CLEARED, {}, origin), nextRoom); // Old room, same process.
  assert.equal(send(nextRoom, E.ROOM_CLEARED, {}, captureRoomScope(nextRoom)).flow.clearRemainingSeconds, 2);
});

test('unbranded or JSON-restored room scopes are rejected, not mistaken for checkpoints', () => {
  const first = start();
  const origin = captureRoomScope(first);
  const plain = { generation: origin.generation, roomIndex: origin.roomIndex };
  assert.throws(() => send(first, E.DAMAGE, {}, plain), TypeError);
  assert.throws(() => send(first, E.DAMAGE, {}, JSON.parse(JSON.stringify(origin))), TypeError);
  assert.throws(() => send({ ...first }, E.RESTART), TypeError);
  assert.deepEqual(Object.keys(origin), ['generation', 'roomIndex']);
  assert.equal(Object.isFrozen(origin), true);
  assert.equal(Object.isFrozen(first), true);
});

test('restart still invalidates an old scope even within the same Web session', () => {
  const first = start();
  const stale = captureRoomScope(first);
  const restarted = send(first, E.RESTART);
  assert.equal(send(restarted, E.DAMAGE, {}, stale), restarted);
  assert.equal(send(restarted, E.DAMAGE, {}, captureRoomScope(restarted)).flow.health, 2);
});

test('tokens from another session cannot trigger lethal damage or a win in a one-room flow', () => {
  const a = send(createRoomScopedFlow({ roomCount: 1 }), E.START);
  const b = send(createRoomScopedFlow({ roomCount: 1 }), E.START);
  const foreign = captureRoomScope(a);
  assert.equal(send(b, E.DAMAGE, { amount: 3 }, foreign), b);
  assert.equal(send(b, E.ROOM_CLEARED, {}, foreign), b);
  const current = captureRoomScope(b);
  const won = send(send(b, E.ROOM_CLEARED, {}, current), E.TICK, { realSeconds: 2 });
  assert.equal(won.flow.phase, P.WON);
  assert.throws(() => captureRoomScope(won), RangeError);
});
