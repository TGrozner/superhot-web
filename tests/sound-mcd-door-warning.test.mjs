import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleMcdCurve} from '../src/sound/mcd-curve.js';
import {createMcdDoorWarnings} from '../src/sound/mcd-door-warning.js';

// Synthetic fixtures; original curve keys, cookies and scene coordinates stay private.
const curve = [
  {time: 0, value: 0, inSlope: 0, outSlope: 0},
  {time: 1, value: 1, inSlope: 0, outSlope: 0},
  {time: 2, value: 0, inSlope: 0, outSlope: 0},
];
const door = {
  curve, rendererId: 'scene::renderer',
  spotlight: {position: [1, 2, 3], direction: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0],
    range: 10, intensity: 30, color: [1, 0, 0], spotAngle: 90, cullingMask: 256,
    cookieTextureId: 'sceneDoorCookie_000', shadows: {m_Type: 1}},
  falseLight: {position: [2, 3, 4], intensity: 4},
};

test('source curve uses Hermite tangents and clamps endpoints', () => {
  assert.equal(sampleMcdCurve(curve, -1), 0);
  assert.equal(sampleMcdCurve(curve, .5), .5);
  assert.equal(sampleMcdCurve(curve, 1), 1);
  assert.equal(sampleMcdCurve(curve, 1.5), .5);
  assert.equal(sampleMcdCurve(curve, 3), 0);
  assert.throws(() => sampleMcdCurve([], 0), /curve/);
  assert.throws(() => sampleMcdCurve([{...curve[0], weightedMode: 1}, curve[1]], .5), /weighted/);
});

test('world envelope modulates source range and false intensity, preserving all renderer fields', () => {
  const warnings = createMcdDoorWarnings({'scene::1': door});
  const packets = warnings.packets(), packet = packets[0];
  assert.equal(packet.active, false);
  assert.equal(packet.spotlight.range, 0);
  assert.equal(warnings.trigger({owner: 'scene', pathId: 1}), true);
  assert.equal(packet.spotlight.enabled, true);
  assert.equal(packet.spotlight.range, 0);
  assert.equal(warnings.advance(1), packets);
  assert.equal(warnings.packets()[0], packet);
  assert.equal(packet.spotlight.range, 10);
  assert.equal(packet.spotlight.intensity, 30);
  assert.equal(packet.falseLight.intensity, 4);
  assert.equal(packet.falseLight.slot, 0);
  for (const key of ['position', 'direction', 'right', 'up', 'color', 'spotAngle', 'cullingMask', 'cookieTextureId', 'shadows']) {
    assert.deepEqual(packet.spotlight[key], door.spotlight[key]);
  }
  assert.deepEqual(packet.falseLight.position, [2, 3, 4]);
  warnings.advance(0);
  assert.equal(packet.falseLight.intensity, 4);
  warnings.advance(1);
  assert.equal(packet.active, false);
  assert.equal(packet.spotlight.enabled, false);
  assert.equal(packet.falseLight.enabled, false);
  assert.equal(packet.falseLight.intensity, 0);
  assert.equal(packet.falseLight.slot, -1);
  assert.equal(door.spotlight.range, 10);
  assert.equal(door.falseLight.intensity, 4);
});

test('repeat trigger retains previous sample until world Update and entrances are independent', () => {
  const warnings = createMcdDoorWarnings({'scene::1': door, 'scene::2': door});
  warnings.trigger('scene::1'); warnings.advance(1);
  warnings.trigger('scene::1');
  assert.equal(warnings.packets()[0].elapsed, 0);
  assert.equal(warnings.packets()[0].falseLight.intensity, 4);
  assert.equal(warnings.advance(.5)[0].falseLight.intensity, 2);
  assert.equal(warnings.packets()[1].active, false);
  assert.equal(warnings.trigger('missing'), false);
  assert.equal(warnings.trigger(null), false);
  assert.throws(() => warnings.advance(-1), /nonnegative/);
  assert.throws(() => warnings.advance(NaN), /nonnegative/);
  warnings.reset();
  assert.ok(warnings.packets().every(packet => !packet.active && packet.falseLight.intensity === 0 && packet.spotlight.range === 0));
  warnings.trigger('scene::2');
  assert.equal(warnings.packets()[1].falseLight.slot, 0);
});

test('false light claims at most three source slots and reuses a released slot', () => {
  const warnings = createMcdDoorWarnings(Object.fromEntries([1, 2, 3, 4].map(id => [`scene::${id}`, door])));
  warnings.trigger('scene::1'); warnings.advance(1);
  for (const id of [2, 3, 4]) warnings.trigger(`scene::${id}`);
  assert.deepEqual(warnings.packets().map(packet => packet.falseLight.slot), [0, 1, 2, -1]);
  warnings.advance(1);
  assert.deepEqual(warnings.packets().map(packet => packet.falseLight.slot), [-1, 1, 2, 0]);
  warnings.reset();
  assert.ok(warnings.packets().every(packet => packet.falseLight.slot === -1));
});

test('expired warning can restart without an invented zero-intensity frame', () => {
  const warnings = createMcdDoorWarnings({'scene::1': door});
  warnings.trigger('scene::1'); warnings.advance(1); warnings.advance(1);
  warnings.trigger('scene::1');
  assert.equal(warnings.packets()[0].falseLight.intensity, 4);
  assert.equal(warnings.advance(0)[0].falseLight.intensity, 0);
});

test('invalid envelopes fail at configuration rather than during a spawn', () => {
  for (const invalid of [[], [{...curve[0], time: NaN}], [curve[1], curve[0]], [{...curve[0], weightedMode: 1}, curve[1]]]) {
    assert.throws(() => createMcdDoorWarnings({bad: {...door, curve: invalid}}), /curve/);
  }
  assert.throws(() => createMcdDoorWarnings({bad: {...door, spotlight: {range: Infinity}}}), /range/);
  assert.deepEqual(createMcdDoorWarnings().packets(), []);
});
