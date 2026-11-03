import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcdDoorWarnings } from '../src/sound/mcd-door-warning.js';
import {
  DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL,
  prepareDojoDoorWarningLighting,
  sampleDojoDoorWarningWebPreview,
} from '../src/render/lighting-model.js';

// Synthetic geometry and curve: no private coordinates, cookie PNG or native shader.
const scene = { sceneBuildIndex: 10, serializedOwner: 'level10',
  scenePath: 'Assets/Scenes/SHRL/SHRL_Dojo2.unity' };
const curve = [
  { time: 0, value: 0, inSlope: 0, outSlope: 0 },
  { time: 1, value: 1, inSlope: 0, outSlope: 0 },
  { time: 2, value: 0, inSlope: 0, outSlope: 0 },
];
const sourceDoor = {
  rendererId: 'level10::71', curve,
  spotlight: {
    position: [1, 2, 3], direction: [0, 0, 1],
    right: [1, 0, 0], up: [0, 1, 0],
    range: 10, intensity: 30, color: [1, 0, 0],
    spotAngle: 90, cullingMask: 256,
    cookieTextureId: 'sceneDoorCookie_000',
    shadows: { m_Type: 1 },
  },
  falseLight: { position: [2, 3, 4], intensity: 4 },
};
const options = {
  verifiedDoorKeys: new Set(['level10::7']),
  decodedCookies: new Set(['sceneDoorCookie_000']),
  meshLayer: 8,
};
const activeWarning = () => {
  const warnings = createMcdDoorWarnings({ 'level10::7': sourceDoor });
  assert.equal(warnings.trigger('level10::7'), true);
  warnings.advance(1);
  return warnings;
};

test('Dojo source door envelope reaches GPU-ready spotlight fields without inventing color/clock', () => {
  const warnings = activeWarning();
  const packet = prepareDojoDoorWarningLighting(scene, warnings.packets(), options);
  assert.equal(packet.sourceScene, 'SHRL_Dojo2/build10/level10');
  assert.equal(packet.nativeLightingParity, false);
  assert.equal(packet.spotlights.length, 1);
  assert.equal(packet.falseLights.length, 1);
  const spot = packet.spotlights[0];
  assert.equal(spot.doorId, 'level10::7');
  assert.equal(spot.range, 10);
  assert.equal(spot.intensity, 30); // Authored intensity stays fixed.
  assert.deepEqual(spot.color, [1, 0, 0]);
  assert.equal(spot.cookieTextureId, 'sceneDoorCookie_000');
  assert.equal(spot.cullingMask, 256);
  assert.ok(Math.abs(spot.cosHalfAngle - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(spot.tanHalfAngle - 1) < 1e-12);
  assert.deepEqual(packet.falseLights[0], {
    doorId: 'level10::7', slot: 0,
    position: [2, 3, 4], intensity: 4,
    shaderParity: 'unverified-no-false-light-composition',
  });
  // Live source/controller owns mutable envelopes; renderer does not consume or advance them.
  assert.equal(warnings.packets()[0].elapsed, 1);
  assert.equal(sourceDoor.spotlight.range, 10);
});

test('provisional cookie projector produces a visibly nonzero Web preview only inside source cone/range', () => {
  const spot = prepareDojoDoorWarningLighting(scene, activeWarning().packets(), options).spotlights[0];
  const center = sampleDojoDoorWarningWebPreview(spot, [1, 2, 8], .4);
  assert.deepEqual(center.cookieUv, [.5, .5]);
  assert.deepEqual(center.rgb, [12, 0, 0]);
  assert.deepEqual(sampleDojoDoorWarningWebPreview(spot, [1, 2, 8], 0).rgb, [0, 0, 0]);
  assert.deepEqual(sampleDojoDoorWarningWebPreview(spot, [1, 2, 14], 1).rgb, [0, 0, 0]);
  assert.deepEqual(sampleDojoDoorWarningWebPreview(spot, [9, 2, 4], 1).rgb, [0, 0, 0]);
  assert.deepEqual(sampleDojoDoorWarningWebPreview(spot, [1, 2, 2], 1).rgb, [0, 0, 0]);
  assert.match(DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL, /texture\(sourceCookie, cookieUv\)\.a/);
  assert.match(DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL, /radius > sourceRange/);
});

test('source layer-mask, loaded original cookie, and verified door identity gate visibility', () => {
  const packets = activeWarning().packets();
  const otherLayer = prepareDojoDoorWarningLighting(scene, packets,
    { ...options, meshLayer: 9 });
  assert.equal(otherLayer.spotlights.length, 0);
  assert.equal(otherLayer.falseLights.length, 1); // Separate global false-light slots.
  assert.equal(otherLayer.omissions[0].reason, 'source-spotlight-layer-mask');

  const missingCookie = prepareDojoDoorWarningLighting(scene, packets,
    { ...options, decodedCookies: new Set() });
  assert.equal(missingCookie.spotlights.length, 0);
  assert.equal(missingCookie.falseLights.length, 1);
  assert.equal(missingCookie.omissions[0].reason, 'source-cookie-not-decoded');

  const notJoined = prepareDojoDoorWarningLighting(scene, packets,
    { ...options, verifiedDoorKeys: new Set() });
  assert.equal(notJoined.spotlights.length, 0);
  assert.equal(notJoined.falseLights.length, 0);
  assert.equal(notJoined.omissions[0].reason, 'unqualified-source-door-join');

  assert.throws(() => prepareDojoDoorWarningLighting(
    { ...scene, sceneBuildIndex: 28 }, packets, options), /Dojo build10/);
  assert.throws(() => prepareDojoDoorWarningLighting(
    { ...scene, scenePath: 'Other.unity' }, packets, options), /Dojo build10/);
});

test('warnings are per-frame signals, not a synthetic permanent red emissive material', () => {
  const warnings = activeWarning();
  warnings.advance(1);
  assert.equal(prepareDojoDoorWarningLighting(scene, warnings.packets(), options).spotlights.length, 0);
  warnings.reset();
  assert.equal(prepareDojoDoorWarningLighting(scene, warnings.packets(), options).falseLights.length, 0);
  warnings.trigger('level10::7');
  // Trigger retains the previously sampled 0 until controller.advance.
  assert.equal(prepareDojoDoorWarningLighting(scene, warnings.packets(), options).spotlights.length, 0);
  warnings.advance(.5);
  const resumed = prepareDojoDoorWarningLighting(scene, warnings.packets(), options).spotlights[0];
  assert.equal(resumed.range, 5);
  assert.equal(resumed.intensity, 30);
});

test('false-light three-slot ceiling does not leak a spotlight cookie or invented falloff', () => {
  const warnings = createMcdDoorWarnings(Object.fromEntries(
    [1, 2, 3, 4].map(i => ['level10::' + i, sourceDoor])));
  for (const i of [1, 2, 3, 4]) warnings.trigger('level10::' + i);
  warnings.advance(1);
  const packets = prepareDojoDoorWarningLighting(scene, warnings.packets(), {
    ...options, verifiedDoorKeys: new Set([1, 2, 3, 4].map(i => 'level10::' + i)),
  });
  assert.equal(packets.spotlights.length, 4);
  assert.deepEqual(packets.falseLights.map(light => light.slot), [0, 1, 2]);
  assert.ok(packets.falseLights.every(light => !Object.hasOwn(light, 'color')));
});

test('missing owner-local Dojo door world TRS fails closed without breaking gameplay', () => {
  const incomplete = {
    ...sourceDoor,
    spotlight: { ...sourceDoor.spotlight },
    falseLight: { ...sourceDoor.falseLight },
  };
  for (const key of ['position', 'direction', 'right', 'up']) delete incomplete.spotlight[key];
  delete incomplete.falseLight.position;
  const warnings = createMcdDoorWarnings({ 'level10::7': incomplete });
  warnings.trigger('level10::7');
  // The warning controller starts at range=0; source TRS must not be required yet.
  const before = prepareDojoDoorWarningLighting(scene, warnings.packets(), options);
  assert.deepEqual(before.spotlights, []);
  assert.deepEqual(before.falseLights, []);

  warnings.advance(1);
  const unresolved = prepareDojoDoorWarningLighting(scene, warnings.packets(), options);
  assert.equal(unresolved.spotlights.length, 0);
  assert.equal(unresolved.falseLights.length, 0);
  assert.deepEqual(unresolved.omissions.map(o => o.reason).sort(), [
    'source-false-light-world-position-not-resolved',
    'source-spotlight-world-basis-not-resolved',
  ]);
  assert.equal(warnings.packets()[0].elapsed, 1);

  // The two light types have independent source-space positions: a missing
  // false-light transform cannot suppress a separately qualified spotlight.
  incomplete.spotlight = { ...sourceDoor.spotlight };
  const onlyFalsePositionMissing = createMcdDoorWarnings({
    'level10::7': incomplete,
  });
  onlyFalsePositionMissing.trigger('level10::7');
  onlyFalsePositionMissing.advance(1);
  const partial = prepareDojoDoorWarningLighting(scene, onlyFalsePositionMissing.packets(), options);
  assert.equal(partial.spotlights.length, 1);
  assert.equal(partial.falseLights.length, 0);
  assert.equal(partial.omissions[0].reason, 'source-false-light-world-position-not-resolved');
});

test('rejects malformed inputs rather than publishing phantom light uniforms', () => {
  const active = activeWarning().packets();
  assert.throws(() => prepareDojoDoorWarningLighting(scene, active,
    { ...options, meshLayer: 32 }), /mesh layer/);
  assert.throws(() => prepareDojoDoorWarningLighting(scene, active,
    { ...options, decodedCookies: [] }), /decoded cookies/);
  assert.throws(() => sampleDojoDoorWarningWebPreview(
    prepareDojoDoorWarningLighting(scene, active, options).spotlights[0], [1, 2, 8], -1),
  /cookie alpha/);
  assert.throws(() => prepareDojoDoorWarningLighting(scene,
    [{ ...active[0], spotlight: { ...active[0].spotlight, direction: [0,0,0] }}], options),
  /Zero or invalid direction/);
});
