import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcdDoorWarnings } from '../src/sound/mcd-door-warning.js';
import {
  DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL,
  prepareDojoDoorWarningLighting,
  createDojoDoorWarningSceneAdapter,
  sampleDojoDoorWarningWebPreview,
  sampleDojoDoorWarningWebGlow,
  sampleDojoDoorFalseLightWebWash,
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
  // J4 Web-only: Red Crystal's saturated base requires an additional pale
  // warning glint. This changes the shader-injected uMode==3 path only.
  const crystal = sampleDojoDoorWarningWebPreview(spot, [1, 2, 8], .4, 3);
  assert.ok(crystal.rgb[1] > center.rgb[1] + .20);
  assert.ok(crystal.rgb[2] > center.rgb[2] + .20);
  assert.equal(crystal.rgb[0] > center.rgb[0], true);
  assert.deepEqual(sampleDojoDoorWarningWebPreview(spot, [1, 2, 8], 0, 3).rgb, [0, 0, 0]);
  assert.match(DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL, /uMode == 3 && dangerRed > 0\.0/);
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



test('J4 authored moving false-light becomes a bounded Web red floor wash, not a phantom source shader', () => {
  const controller = activeWarning();
  const fill = prepareDojoDoorWarningLighting(scene, controller.packets(), options).falseLights[0];
  const atLamp = sampleDojoDoorFalseLightWebWash(fill, [2, 3, 4]);
  assert.ok(Math.abs(atLamp.rgb[0] - 4 / 7) < 1e-12);
  assert.ok(atLamp.rgb[1] < 0 && atLamp.rgb[2] < 0,
    'red warning remains distinguishable from bright concrete');
  const halfway = sampleDojoDoorFalseLightWebWash(fill, [4, 3, 4]);
  assert.ok(Math.abs(halfway.rgb[0] - 0.25) < 1e-12,
    'Web-only 4 m quadratic smooth falloff has a deterministic CPU/GPU contract');
  assert.deepEqual(sampleDojoDoorFalseLightWebWash(fill, [6, 3, 4]).rgb, [0, 0, 0]);
  assert.deepEqual(sampleDojoDoorFalseLightWebWash({ ...fill, intensity: 0 }, [2, 3, 4]).rgb,
    [0, 0, 0]);
  const moved = { ...fill, position: [3, 3, 4] };
  assert.ok(sampleDojoDoorFalseLightWebWash(moved, [3, 3, 4]).rgb[0] > halfway.rgb[0],
    'animated source false-light position moves the visible Web wash');
  const crystal = sampleDojoDoorFalseLightWebWash(fill, [2, 3, 4], 3);
  assert.ok(crystal.rgb[1] > atLamp.rgb[1] && crystal.rgb[2] > atLamp.rgb[2],
    'Web-authored Red Crystal glint shares the existing material grade');
  assert.match(DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL, /vec3 dojoDoorFalseLightWashWeb\(/);
  assert.match(DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL, /sourceIntensity \* fade \* fade/);
  assert.throws(() => sampleDojoDoorFalseLightWebWash(
    { ...fill, shaderParity: 'native-verified' }, [2, 3, 4]),
  /Source-qualified/);
  controller.reset();
  assert.equal(prepareDojoDoorWarningLighting(scene, controller.packets(), options).falseLights.length, 0);
});

test('J4 Web doorway wash favours the lamp-facing surface without hard-killing backface warnings', () => {
  const fill = prepareDojoDoorWarningLighting(scene, activeWarning().packets(), options).falseLights[0];
  const point = [4, 3, 4]; // Two meters from source false light at [2,3,4].
  const face = sampleDojoDoorFalseLightWebWash(fill, point, 2, [-1, 0, 0]);
  const back = sampleDojoDoorFalseLightWebWash(fill, point, 2, [1, 0, 0]);
  const noNormals = sampleDojoDoorFalseLightWebWash(fill, point);
  assert.equal(face.rgb[0], .25, 'front-facing red wash retains its existing 4m energy');
  assert.equal(back.rgb[0], .0625, 'rear surface keeps a visible 20% energy floor');
  assert.deepEqual(noNormals.rgb, face.rgb,
    'unqualified mesh normals preserve the old Web wash rather than disappearing');
  assert.equal(sampleDojoDoorFalseLightWebWash(fill, [2, 3, 4], 2, [1, 0, 0]).rgb[0], 4 / 7,
    'light-center behaviour remains stable without an undefined direction');
  assert.throws(() => sampleDojoDoorFalseLightWebWash(fill, point, 2, [0, 0, 0]),
    /Zero or invalid direction/);
  assert.match(DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL, /uHasNormals != 0 && radius > 0\\.0001/);
  assert.match(DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL, /sourceIntensity \\* fade \\* fade \\* facing/);
});

test('per-layer warning reuse never freezes live SH-07 clock or SH-04 steering vectors', () => {
  const key = 'level10::7089';
  const door = {
    ...sourceDoor, spotlight: { ...sourceDoor.spotlight, position: [1, 2, 3],
      direction: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] },
    falseLight: { ...sourceDoor.falseLight, position: [2, 3, 4] },
  };
  const warning = createMcdDoorWarnings({ [key]: door });
  warning.trigger(key);
  warning.advance(.5);
  // SH-07 returns the SAME mutated array on every call, even after a tick.
  const packets = warning.packets();
  const textureId = door.spotlight.cookieTextureId;
  const adapter = createDojoDoorWarningSceneAdapter({
    source: scene,
    textures: new Map([[textureId, { id: textureId }]]),
    gameplay: { audio: { doors: { [key]: door } } },
    instanceMap: new Map([
      ['a', { layer: 8 }], ['b', { layer: 8 }], ['c', { layer: 9 }],
    ]),
  }, new Map([[textureId, { width: 2, height: 2 }]]));
  const first = adapter.prepareForInstance('a', packets);
  assert.equal(first.spotlights.length, 1);
  assert.strictEqual(adapter.prepareForInstance('b', packets), first,
    'identical layer and live signal reuse the already validated GPU packet');
  const other = adapter.prepareForInstance('c', packets);
  assert.equal(other.spotlights.length, 0);
  assert.notStrictEqual(other, first);
  assert.strictEqual(adapter.prepareForInstance('c', packets), other);

  // In-place world basis steering MUST invalidate despite stable array identity.
  packets[0].spotlight.position[0] += 2;
  const steered = adapter.prepareForInstance('a', packets);
  assert.notStrictEqual(steered, first);
  assert.equal(steered.spotlights[0].position[0], 3);
  assert.equal(first.spotlights[0].position[0], 1);
  packets[0].spotlight.direction[0] = .2;
  const aimed = adapter.prepareForInstance('b', packets);
  assert.notStrictEqual(aimed, steered);
  assert.ok(aimed.spotlights[0].direction[0] > 0);
  // False-light movement also invalidates the combined packet.
  packets[0].falseLight.position[1] += 1;
  const falseMoved = adapter.prepareForInstance('a', packets);
  assert.equal(falseMoved.falseLights[0].position[1], 4);

  warning.advance(.25);
  assert.strictEqual(warning.packets(), packets);
  const later = adapter.prepareForInstance('a', packets);
  assert.notStrictEqual(later, falseMoved);
  assert.notEqual(later.spotlights[0].range, falseMoved.spotlights[0].range);
  warning.reset();
  const inactive = adapter.prepareForInstance('a', packets);
  assert.equal(inactive.spotlights.length, 0);
  assert.equal(inactive.falseLights.length, 0);
});


test('J4 mesh-sphere cull skips only genuinely out-of-range/off-cone GPU warnings', () => {
  const key = 'level10::7089';
  const doors = { [key]: { ...sourceDoor } };
  const warning = createMcdDoorWarnings(doors);
  warning.trigger(key);
  warning.advance(1);
  const packets = warning.packets();
  const textureId = sourceDoor.spotlight.cookieTextureId;
  const at = (x, y, z, scale = 1) => [
    scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, x, y, z, 1,
  ];
  const instance = (id, x, y, z, scale = 1) => ({
    id, layer: 8, meshId: 'source-box', model: at(x, y, z, scale),
    classification: { worldPassEligible: true },
  });
  const sourceScene = {
    source: scene,
    textures: new Map([[textureId, { id: textureId }]]),
    gameplay: { audio: { doors } },
    meshes: new Map([['source-box', { mesh: { bounds: {
      center: [0, 0, 0], radius: 0.5,
    } } }]]),
    instanceMap: new Map([
      ['near', instance('near', 1, 2, 8)],
      ['far', instance('far', 31, 2, 8)],
      ['behind', instance('behind', 1, 2, 0)],
      ['outside-cone', instance('outside-cone', 9, 2, 5)],
      // A scaled mesh can still overlap the finite cone even when its
      // *center* sits outside; its bounding sphere must retain the light.
      ['scaled-edge', instance('scaled-edge', 1, 2, 14.5, 4)],
      ['large-cone-edge', instance('large-cone-edge', 9, 2, 5, 12)],
      // Missing bounds must not silently erase a rendered light.
      ['no-geometry', { id: 'no-geometry', layer: 8 }],
    ]),
  };
  const adapter = createDojoDoorWarningSceneAdapter(
    sourceScene, new Map([[textureId, { width: 2, height: 2 }]]));
  const near = adapter.prepareForInstance('near', packets);
  assert.equal(near.spotlights.length, 1);
  assert.equal(near.webFalseLights.length, 1, 'nearby doorway wash remains on the authored mesh');
  for (const id of ['far', 'behind', 'outside-cone']) {
    const packet = adapter.prepareForInstance(id, packets);
    assert.equal(packet.spotlights.length, 0, id);
    assert.equal(packet.webBoundsCulledSpotlights, 1, id);
    assert.strictEqual(adapter.prepareForInstance(id, packets), packet,
      'reusing the same source tick also reuses per-instance GPU packet');
    assert.equal(packet.falseLights.length, 1,
      'source false-light slot/data is preserved even when its Web wash is culled');
    if (id === 'far' || id === 'outside-cone') {
      assert.equal(packet.webFalseLights.length, 0,
        'out-of-range 4 m Web floor wash does no fragment work on distant meshes');
      assert.equal(packet.webBoundsCulledFalseLights, 1);
    }
  }
  assert.equal(adapter.prepareForInstance('scaled-edge', packets).spotlights.length, 1);
  assert.equal(adapter.prepareForInstance('scaled-edge', packets).webFalseLights.length, 0);
  assert.equal(adapter.prepareForInstance('large-cone-edge', packets).webFalseLights.length, 1,
    'large scale must not cull a red wash that may reach its mesh sphere');
  assert.equal(adapter.prepareForInstance('large-cone-edge', packets).spotlights.length, 1);
  assert.strictEqual(adapter.prepareForInstance('no-geometry', packets), near,
    'unknown mesh geometry fails open to avoid losing visible illumination');
  // SH-04's live steering updates source packets in-place: previously culled
  // geometry must light up on the very next warning update.
  packets[0].spotlight.position[0] = 31;
  const steered = adapter.prepareForInstance('far', packets);
  assert.equal(steered.spotlights.length, 1);
  assert.deepEqual(steered.spotlights[0].position, [31, 2, 3]);
  warning.reset();
  assert.equal(adapter.prepareForInstance('far', packets).spotlights.length, 0);
});
