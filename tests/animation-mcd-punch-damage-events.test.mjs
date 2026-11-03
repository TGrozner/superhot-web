import test from 'node:test';
import assert from 'node:assert/strict';
import { planMcdPunchDamageEvents } from '../src/animation/mcd-punch-damage-events.js';

const T_ON = 0.4686083197593689;
const T_OFF = 0.7319236993789673;
const source = Object.freeze({
  clipOwner: 'sharedassets0.assets', clipPathId: 468,
  activeClipConfirmed: true, preparedIntervalConfirmed: true,
  activeGameObjectConfirmed: true, methodReceiverConfirmed: true,
});
const plan = (lastClipTime, currentClipTime, changes = {}) =>
  planMcdPunchDamageEvents({ ...source, lastClipTime, currentClipTime, ...changes });

test('source-authored punch damage flag starts only on the exact event crossing', () => {
  assert.deepEqual(plan(0, T_ON - 0.001).commands, []);
  const result = plan(0, T_ON);
  assert.equal(result.status, 'source-event-requests');
  assert.deepEqual(result.commands, [{
    op: 'invoke-PejAiAnimator-animation-event', callback: 'MeleeDamageStart',
    stateField: 'MeleeDamage', value: true, sourceEventIndex: 0, clipTime: T_ON,
  }]);
});

test('the end event is an explicit false write, not an inferred wall-clock timeout', () => {
  assert.deepEqual(plan(T_ON, T_OFF).commands.map(x => [x.callback, x.value]),
    [['MeleeDamageEnd', false]]);
  assert.deepEqual(plan(T_OFF, 0.9).commands, []);
});

test('skipping over both events preserves serialized order and both writes', () => {
  assert.deepEqual(plan(0.3, 0.9).commands.map(x => [x.callback, x.value]), [
    ['MeleeDamageStart', true], ['MeleeDamageEnd', false],
  ]);
});

test('reverse traversal follows native event order; no invented reversal of bool', () => {
  assert.deepEqual(plan(0.9, 0.3).commands.map(x => [x.callback, x.value]), [
    ['MeleeDamageEnd', false], ['MeleeDamageStart', true],
  ]);
});

test('equal prepared clip times do not produce an event even inside the window', () => {
  assert.deepEqual(plan(T_ON, T_ON).commands, []);
  assert.deepEqual(plan(0.55, 0.55).commands, []);
});

test('a different source clip or owner is explicitly unsupported', () => {
  assert.deepEqual(plan(0, 1, { clipPathId: 424 }), { status: 'unsupported-clip', commands: [] });
  assert.deepEqual(plan(0, 1, { clipOwner: 'resources.assets' }),
    { status: 'unsupported-clip', commands: [] });
});

test('missing evidence for any native dispatch gate suppresses all method requests', () => {
  for (const key of [
    'activeClipConfirmed', 'preparedIntervalConfirmed',
    'activeGameObjectConfirmed', 'methodReceiverConfirmed',
  ]) {
    assert.deepEqual(plan(0, 1, { [key]: false }),
      { status: 'unqualified-dispatch', commands: [] });
  }
});

test('no fabricated defaults or invalid source times are accepted', () => {
  assert.throws(() => planMcdPunchDamageEvents(), /clipOwner/);
  assert.throws(() => plan(0, 1, { preparedIntervalConfirmed: undefined }), /boolean/);
  assert.throws(() => plan(0, Infinity), /finite clip seconds/);
  assert.throws(() => plan(NaN, 1), /finite clip seconds/);
  assert.throws(() => plan(0, 1, { clipPathId: 0 }), /positive safe integer/);
});

test('one crossing partitioned into updates does not duplicate a callback', () => {
  const whole = plan(0, 1).commands;
  const parts = [plan(0, 0.5), plan(0.5, 1)].flatMap(x => x.commands);
  assert.deepEqual(parts, whole);
});

const VARIANTS = [
  [429, 0.4686083197593689, 0.7319236993789673],
  [440, 0.36084142327308655, 0.5744336247444153],
  [448, 0.2970873713493347, 0.41553398966789246],
  [457, 0.3728155493736267, 0.4535922706127167],
  [468, 0.4686083197593689, 0.7319236993789673],
  [475, 0.35922330617904663, 0.5582523941993713],
  [483, 0.28446266055107117, 0.43558305501937866],
  [489, 0.3588349521160126, 0.45980581641197205],
];

for (const [clipPathId, start, end] of VARIANTS) {
  test(`source fist variant ${clipPathId} uses its own exact callback interval`, () => {
    const on = plan(0, start, { clipPathId });
    assert.deepEqual(on.commands.map(x => [x.callback, x.value, x.clipTime]),
      [['MeleeDamageStart', true, start]]);
    const off = plan(start, end, { clipPathId });
    assert.deepEqual(off.commands.map(x => [x.callback, x.value, x.clipTime]),
      [['MeleeDamageEnd', false, end]]);
    assert.deepEqual(plan(end, end + 0.1, { clipPathId }).commands, []);
    assert.deepEqual(plan(0, end + 0.1, { clipPathId }).commands.map(x => x.sourceEventIndex), [0, 1]);
    assert.deepEqual(plan(0, end + 0.1, { clipPathId, activeClipConfirmed: false }).commands, []);
  });
}

test('variant boundaries are not copied from fist-01 and unknown clip remains rejected', () => {
  const second = plan(0, 0.3, { clipPathId: 448 });
  assert.equal(second.commands.length, 1);
  assert.equal(second.commands[0].clipTime, 0.2970873713493347);
  assert.deepEqual(plan(0, 0.3, { clipPathId: 468 }).commands, []);
  assert.equal(plan(0, 1, { clipPathId: 490 }).status, 'unsupported-clip');
});
