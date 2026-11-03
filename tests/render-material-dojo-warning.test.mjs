import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcdDoorWarnings } from '../src/sound/mcd-door-warning.js';
import {
  DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL,
  prepareDojoDoorWarningLighting,
  createDojoDoorWarningSceneAdapter,
  sampleDojoDoorWarningWebPreview,
  sampleDojoDoorWarningWebGlow,
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
  assert.ok(Math.abs(center.rgb[0] - (2 / 3)) < 1e-12); // Web highlight-compressed, never 12x clipped red.
  // Web creative art direction: signed red grading is visible on near-white
  // Concrete, where additive red alone would clamp and barely change hue.
  assert.ok(Math.abs(center.rgb[1] + (2 / 3) * .32) < 1e-12);
  assert.ok(Math.abs(center.rgb[2] + (2 / 3) * .32) < 1e-12);
  const brightConcrete = [.9, .9, .9];
  const graded = brightConcrete.map((base, i) =>
    Math.max(0, Math.min(1, base + center.rgb[i])));
  assert.ok(graded[0] - graded[1] > .25, 'bright Concrete receives visibly red warning contrast');
  const near = sampleDojoDoorWarningWebPreview(spot, [1, 2, 4], .4);
  const far = sampleDojoDoorWarningWebPreview(spot, [1, 2, 12], .4);
  assert.ok(near.rgb[0] > center.rgb[0] && center.rgb[0] > far.rgb[0]);
  assert.deepEqual(sampleDojoDoorWarningWebPreview(spot, [1, 2, 8], 0).rgb, [0, 0, 0]);
  assert.deepEqual(sampleDojoDoorWarningWebPreview(spot, [1, 2, 14], 1).rgb, [0, 0, 0]);
  assert.deepEqual(sampleDojoDoorWarningWebPreview(spot, [9, 2, 4], 1).rgb, [0, 0, 0]);
  assert.deepEqual(sampleDojoDoorWarningWebPreview(spot, [1, 2, 2], 1).rgb, [0, 0, 0]);
  assert.match(DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL, /texture\(sourceCookie, cookieUv\)\.a/);
  assert.match(DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL, /radius > sourceRange/);
  assert.match(DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL, /dojoWebWarningCompression/);
  assert.match(DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL, /dojoWebWarningContrast/);
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

test('source scene cookie adapter requires decoded image and authored layer8, never a phantom spotlight', () => {
  const key = 'level10::7089';
  const doors = { [key]: sourceDoor };
  const makeScene = textures => ({
    source: scene,
    textures,
    gameplay: { audio: { doors } },
    instanceMap: new Map([
      ['native-instance-8', { id: 'native-instance-8', layer: 8 }],
      ['native-instance-9', { id: 'native-instance-9', layer: 9 }],
    ]),
  });
  const warnings = createMcdDoorWarnings(doors);
  warnings.trigger(key);
  warnings.advance(1);
  const records = warnings.packets();
  const textureId = sourceDoor.spotlight.cookieTextureId;
  const sourceTextures = new Map([[textureId, { id: textureId }]]);
  // This is an explicit unit-test image stand-in. The browser adapter
  // requires a real ImageBitmap when ImageBitmap exists globally.
  const decodedImage = { width: 2, height: 2 };
  const loaded = createDojoDoorWarningSceneAdapter(makeScene(sourceTextures),
    new Map([[textureId, decodedImage]]));
  assert.equal(loaded.cookieStatus[0].decoded, true);
  assert.equal(loaded.cookieImage(textureId), decodedImage);
  assert.equal(loaded.prepareForInstance('native-instance-8', records).spotlights.length, 1);
  assert.equal(loaded.prepareForInstance('native-instance-9', records).spotlights.length, 0);
  assert.equal(loaded.prepareForInstance('native-instance-9', records).omissions[0].reason,
    'source-spotlight-layer-mask');

  for (const [textures, images, expected] of [
    [sourceTextures, new Map(), 'source-cookie-image-not-decoded'],
    [sourceTextures, new Map([[textureId, new Uint8Array(4)]]),
      'source-cookie-image-not-decoded'],
    [new Map(), new Map([[textureId, decodedImage]]),
      'source-cookie-not-in-scene-textures'],
  ]) {
    const unresolved = createDojoDoorWarningSceneAdapter(makeScene(textures), images);
    assert.equal(unresolved.cookieStatus[0].reason, expected);
    assert.equal(unresolved.cookieImage(textureId), null);
    assert.equal(unresolved.prepareForInstance('native-instance-8', records).spotlights.length, 0);
  }
  assert.throws(() => loaded.prepareForInstance('invented-id', records),
    /Authored world instance/);
  assert.throws(() => createDojoDoorWarningSceneAdapter(
    makeScene(sourceTextures), []), /decoded images required/);
});

// J4 Web choice: make an authored red warning visible without inventing a cookie
// asset. Rendering is opt-in at the SH-05 WebGL integration boundary.
test('opt-in Web-only glow retains real door joins, masks, envelopes and missing-cookie evidence', () => {
  const records = activeWarning().packets();
  const withoutCookie = { ...options, decodedCookies: new Set() };
  assert.equal(prepareDojoDoorWarningLighting(scene, records, withoutCookie).spotlights.length, 0);
  const fallback = prepareDojoDoorWarningLighting(scene, records,
    { ...withoutCookie, allowWebCookieFreeGlow: true });
  assert.equal(fallback.spotlights.length, 1);
  assert.equal(fallback.spotlights[0].webPreviewMode, 'web-procedural-no-cookie');
  assert.equal(fallback.spotlights[0].sourceCookieDecoded, false);
  assert.equal(fallback.spotlights[0].shaderParity, 'web-authored-creative-light-not-MCD');
  assert.equal(fallback.omissions[0].reason, 'source-cookie-not-decoded');
  const inCone = sampleDojoDoorWarningWebGlow(fallback.spotlights[0], [1, 2, 8]);
  const outsideCone = sampleDojoDoorWarningWebGlow(fallback.spotlights[0], [9, 2, 4]);
  assert.ok(inCone.rgb[0] > 0 && inCone.rgb[0] < 1);
  assert.ok(inCone.rgb[1] < 0 && inCone.rgb[2] < 0,
    'cookie-free warning uses the same Web red-contrast grading');
  assert.deepEqual(outsideCone.rgb, [0, 0, 0]);
  assert.equal(sampleDojoDoorWarningWebGlow(fallback.spotlights[0], [1, 2, 13]).rgb[0], 0);
  assert.equal(prepareDojoDoorWarningLighting(scene, records,
    { ...withoutCookie, meshLayer: 9, allowWebCookieFreeGlow: true }).spotlights.length, 0);
  assert.match(DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL, /vec3 dojoDoorWarningSpotWebGlow\(/);
  assert.throws(() => sampleDojoDoorWarningWebGlow(
    prepareDojoDoorWarningLighting(scene, records, options).spotlights[0], [1, 2, 8]),
  /Explicit Web procedural/);
});
