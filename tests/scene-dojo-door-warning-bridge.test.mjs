import test from 'node:test';
import assert from 'node:assert/strict';
import { createDojoDoorWarningBridge, DOJO_DOOR_SOURCE_BINDINGS } from '../src/scenes/dojo-door-warning-bridge.js';
import { prepareDojoDoorWarningLighting } from '../src/render/lighting-model.js';

// All fixtures are synthetic. The component IDs are non-asset Unity metadata;
// no native AnimationCurve, texture, model, compiled shader or game output.
const curve = [
  { time: 0, value: 0, inSlope: 0, outSlope: 0 },
  { time: 1, value: 1, inSlope: 0, outSlope: 0 },
  { time: 2, value: 0, inSlope: 0, outSlope: 0 },
];
const door = key => ({
  curve, rendererId: `test-${key}`,
  spotlight: { range: 10, intensity: 30, spotAngle: 99,
    cullingMask: 256, cookieTextureId: 'test-local-cookie' },
  falseLight: { intensity: 4, position: [2, 3, 4] },
});
const doors = Object.fromEntries(DOJO_DOOR_SOURCE_BINDINGS.map(b => {
  const key = `level10::${b.warningComponentPathId}`;
  return [key, door(key)];
}));
const source = { sceneBuildIndex: 10, serializedOwner: 'level10',
  scenePath: 'Assets/Scenes/SHRL/SHRL_Dojo2/SHRL_Dojo2.unity' };
const scene = (overrides = {}) => ({ source, gameplay: { audio: { doors } }, ...overrides });
const warning = (go, sourceOverride) => ({ type: 'door-warning',
  point: { id: 'arbitrary-web-id', source: sourceOverride ?? { owner: 'level10', path_id: go } }, delay: 1 });

test('three native serialized SpawnerPoint -> SpawnerDoors -> visual light chains are unique', () => {
  assert.deepEqual(DOJO_DOOR_SOURCE_BINDINGS.map(b => b.spawnGameObjectPathId), [103, 221, 370]);
  assert.deepEqual(DOJO_DOOR_SOURCE_BINDINGS.map(b => b.warningComponentPathId), [7089, 7090, 7091]);
  assert.equal(new Set(DOJO_DOOR_SOURCE_BINDINGS.map(b => b.spotlightComponentPathId)).size, 3);
  assert.equal(new Set(DOJO_DOOR_SOURCE_BINDINGS.map(b => b.falseLightComponentPathId)).size, 3);
  const bridge = createDojoDoorWarningBridge(scene());
  assert.equal(bridge.readiness, 'source-catalog-present');
  assert.equal(bridge.packets().length, 3);
  for (const b of DOJO_DOOR_SOURCE_BINDINGS) {
    assert.deepEqual(bridge.accept(warning(b.spawnGameObjectPathId)), {
      status: 'triggered', spawnPathId: b.spawnGameObjectPathId,
      doorKey: `level10::${b.warningComponentPathId}`,
    });
  }
  assert.equal(bridge.advance(1).length, 3);
  assert.deepEqual(bridge.packets().map(p => p.spotlight.range), [10, 10, 10]);
  assert.deepEqual(bridge.packets().map(p => p.spotlight.intensity), [30, 30, 30]);
  assert.deepEqual(bridge.packets().map(p => p.spotlight.cullingMask), [256, 256, 256]);
  assert.deepEqual(bridge.packets().map(p => p.falseLight.slot), [0, 1, 2]);
});

test('the warning signal advances in world seconds, independently from unscaled spawn delay', () => {
  const bridge = createDojoDoorWarningBridge(scene());
  const live = bridge.packets();
  bridge.accept(warning(103));
  assert.equal(bridge.packets(), live, 'no per-frame GPU packet churn');
  assert.equal(bridge.advance(0)[0].spotlight.range, 0);
  // An unscaled source spawn order has no effect on the source visual envelope.
  assert.equal(bridge.advance(0)[0].elapsed, 0);
  assert.equal(bridge.advance(0.5)[0].spotlight.range, 6.3,
    'Web-authored beacon breathing adds 26% during a live source envelope');
  assert.equal(bridge.advance(1.5)[0].active, false);
  bridge.reset();
  assert.equal(bridge.packets()[0].falseLight.slot, -1);
});

test('wrong scene, missing exporter identity and absent catalog fail closed (never flash guessed doors)', () => {
  const wrong = createDojoDoorWarningBridge(scene({ source: { ...source, sceneBuildIndex: 28 } }));
  assert.equal(wrong.accept(warning(103)).status, 'not-dojo-build10-source');
  assert.deepEqual(wrong.advance(0.2), []);
  const absent = createDojoDoorWarningBridge(scene({ gameplay: { audio: {} } }));
  assert.equal(absent.accept(warning(103)).status, 'missing-private-door-catalog');
  const bridge = createDojoDoorWarningBridge(scene());
  assert.equal(bridge.accept(warning(103, { owner: 'level28', path_id: 103 })).status, 'missing-verified-spawn-go');
  assert.equal(bridge.accept(warning(103, { owner: 'level10', path_id: 'door-a' })).status, 'missing-verified-spawn-go');
  assert.equal(bridge.accept({ type: 'door-warning', point: { id: '103' } }).status, 'missing-verified-spawn-go');
  assert.equal(bridge.accept(warning(999)).status, 'spawn-go-not-bound-in-source');
  assert.equal(bridge.accept({ type: 'spawn', point: { id: '103' } }).status, 'ignored-not-warning');
  assert.deepEqual(bridge.packets().map(p => p.active), [false, false, false]);
  assert.throws(() => bridge.advance(-1), /nonnegative/);
});

test('missing one source warning ID never redirects the signal to an adjacent door', () => {
  const partialDoors = { ...doors };
  delete partialDoors['level10::7090'];
  const bridge = createDojoDoorWarningBridge(scene({ gameplay: { audio: { doors: partialDoors } } }));
  assert.deepEqual(bridge.accept(warning(221)), {
    status: 'source-door-not-in-private-catalog', spawnPathId: 221, doorKey: 'level10::7090',
  });
  assert.deepEqual(bridge.packets().map(p => p.active), [false, false]);
  assert.equal(bridge.accept(warning(103)).status, 'triggered');
  assert.deepEqual(bridge.packets().map(p => p.active), [true, false]);
});

const browserFromUnityX = 'browserWorld = H * sourceUnityWorld * H, H=diag(-1,1,1,1)';
const noPrecomputedWorldCatalog = Object.fromEntries(DOJO_DOOR_SOURCE_BINDINGS.map(binding => {
  const key = `level10::${binding.warningComponentPathId}`;
  const sourceDoor = door(key);
  // Contract fixture: real private scene package may lack these derived
  // world fields even when it has the serialized light/cookie properties.
  delete sourceDoor.falseLight.position;
  sourceDoor.spotlight.color = [1, 0, 0];
  return [key, sourceDoor];
}));
const browserScene = overrides => scene({
  coordinateSpace: { browserFromUnity: browserFromUnityX },
  gameplay: { audio: { doors: noPrecomputedWorldCatalog } },
  ...overrides,
});

test('Dojo three parent=0 hierarchies yield source-qualified browser-world spotlight and false-light packets', () => {
  const bridge = createDojoDoorWarningBridge(browserScene());
  assert.equal(bridge.readiness, 'source-catalog-present');
  for (const binding of DOJO_DOOR_SOURCE_BINDINGS) {
    assert.equal(bridge.accept(warning(binding.spawnGameObjectPathId)).status, 'triggered');
  }
  bridge.advance(1);
  const packets = bridge.packets();
  assert.deepEqual(packets.map(packet => packet.id), ['level10::7089', 'level10::7090', 'level10::7091']);
  const expectedWorld = [
    { spot: [16.010014, 1.7, -17.900024], falseLight: [13.100007, 1.7, -17.899987],
      forward: [-1, 0, 0] },
    { spot: [-4.149988, 2.7, -12.039994], falseLight: [-4.149997, 2.7, -14.95],
      forward: [0, 0, -1] },
    { spot: [12.250015, 1.7, -3.639992], falseLight: [12.249999, 1.7, -6.549998],
      forward: [0, 0, -1] },
  ];
  packets.forEach((packet, index) => {
    const expected = expectedWorld[index];
    packet.spotlight.position.forEach((value, axis) =>
      assert.ok(Math.abs(value - expected.spot[axis]) < 0.00001));
    packet.falseLight.position.forEach((value, axis) =>
      assert.ok(Math.abs(value - expected.falseLight[axis]) < 0.00001));
    // The 1-second pose is deliberately Web-animated: verify a valid
    // live 3D cookie basis, not a frozen source direction.
    const basis = [packet.spotlight.direction, packet.spotlight.right, packet.spotlight.up];
    for (const axis of basis) {
      assert.ok(Math.abs(Math.hypot(...axis) - 1) < 0.00001);
    }
    for (let a = 0; a < basis.length; a++) {
      for (let b = a + 1; b < basis.length; b++) {
        assert.ok(Math.abs(basis[a].reduce((sum, v, i) =>
          sum + v * basis[b][i], 0)) < 0.00001);
      }
    }
  });

  // SH-13 adapter receives data ONLY: renderer still needs source cookie
  // alpha, mesh layer 8 and an SH-05 GPU hook to emit visible pixels.
  const lights = prepareDojoDoorWarningLighting(source, packets, {
    verifiedDoorKeys: new Set(packets.map(packet => packet.id)),
    decodedCookies: new Set(['test-local-cookie']),
    meshLayer: 8,
  });
  assert.equal(lights.spotlights.length, 3);
  assert.equal(lights.falseLights.length, 3);
  assert.deepEqual(lights.omissions, []);
  assert.equal(lights.nativeLightingParity, false);
  bridge.reset();
  assert.equal(bridge.packets().filter(packet => packet.active).length, 0);
  packets.forEach((packet, index) => {
    packet.spotlight.direction.forEach((value, axis) =>
      assert.ok(Math.abs(value - expectedWorld[index].forward[axis]) < 0.0001));
    assert.deepEqual(packet.spotlight.up, [0, 1, 0]);
    assert.equal(packet.spotlight.spotAngle, 99);
  });
});

test('world-basis enrichment fails closed on unverified coordinates, and never overrides private runtime basis', () => {
  const unverified = createDojoDoorWarningBridge(browserScene({
    coordinateSpace: { browserFromUnity: 'unsupported-axes' },
  }));
  unverified.accept(warning(103));
  unverified.advance(1);
  assert.equal(unverified.packets()[0].spotlight.position, undefined);
  assert.equal(unverified.packets()[0].falseLight.position, undefined);

  const catalogWithPartialRuntime = { ...noPrecomputedWorldCatalog };
  catalogWithPartialRuntime['level10::7089'] = {
    ...noPrecomputedWorldCatalog['level10::7089'],
    spotlight: {
      ...noPrecomputedWorldCatalog['level10::7089'].spotlight,
      position: [9, 8, 7],
    },
    falseLight: {
      ...noPrecomputedWorldCatalog['level10::7089'].falseLight,
      position: [6, 5, 4],
    },
  };
  const bridge = createDojoDoorWarningBridge(browserScene({
    gameplay: { audio: { doors: catalogWithPartialRuntime } },
  }));
  bridge.accept(warning(103));
  bridge.advance(1);
  assert.deepEqual(bridge.packets()[0].spotlight.position, [9, 8, 7]);
  assert.equal(bridge.packets()[0].spotlight.direction, undefined,
    'never mix a partial runtime basis with serialized initial axes');
  assert.deepEqual(bridge.packets()[0].falseLight.position, [6, 5, 4]);
  assert.equal(catalogWithPartialRuntime['level10::7090'].spotlight.position, undefined,
    'source catalog is not mutated');
});

test('J4 Web beacons sweep real Dojo door cones smoothly without new packets or source mutation', () => {
  const bridge = createDojoDoorWarningBridge(browserScene());
  const packets = bridge.packets();
  const first = packets[0];
  const sourceIntensity = first.spotlight.intensity;
  const sourceAngle = first.spotlight.spotAngle;
  const firstDirection = first.spotlight.direction;
  const firstRight = first.spotlight.right;
  const firstUp = first.spotlight.up;
  const baseForward = [...firstDirection];
  const baseRight = [...firstRight];
  const baseUp = [...firstUp];

  assert.equal(bridge.accept(warning(103)).status, 'triggered');
  bridge.advance(0.5); // Source curve = 50% range; Web sweep at a quarter cycle.
  assert.equal(bridge.packets(), packets, 'no warning packet allocations per frame');
  assert.equal(first.spotlight.direction, firstDirection, 'direction buffer reused');
  assert.equal(first.spotlight.right, firstRight, 'right buffer reused');
  assert.equal(first.spotlight.up, firstUp, 'up buffer reused');
  assert.ok(Math.abs(first.spotlight.spotAngle - sourceAngle * 0.62) < 1e-10,
    '3D warning lighthouse narrows its visible cone at full sideways sweep');
  assert.ok(first.spotlight.direction[1] > 0.07,
    'lighthouse also climbs the doorway; it does not merely rotate horizontally');
  assert.ok(Math.abs(first.spotlight.range - 6.3) < 1e-10);
  assert.ok(Math.abs(first.spotlight.intensity - sourceIntensity * 1.2) < 1e-10);
  assert.ok(first.spotlight.direction[2] < baseForward[2] - 0.25,
    'beacon sweeps over the real source doorway, instead of staying fixed');
  assert.ok(Math.abs(Math.hypot(...first.spotlight.direction) - 1) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...first.spotlight.right) - 1) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...first.spotlight.up) - 1) < 1e-9);
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  assert.ok(Math.abs(dot(first.spotlight.direction, first.spotlight.right)) < 1e-9);
  assert.ok(Math.abs(dot(first.spotlight.direction, first.spotlight.up)) < 1e-9);
  assert.ok(Math.abs(dot(first.spotlight.right, first.spotlight.up)) < 1e-9,
    'animated 3D cookie basis remains orthonormal');
  assert.equal(packets[1].active, false, 'other door warnings stay off');
  assert.equal(packets[2].active, false);

  // Repeated events must restart the same emitter from its own initial basis.
  assert.equal(bridge.accept(warning(103)).status, 'triggered');
  assert.deepEqual(first.spotlight.direction, baseForward);
  assert.deepEqual(first.spotlight.right, baseRight);
  assert.deepEqual(first.spotlight.up, baseUp);
  assert.equal(first.spotlight.spotAngle, sourceAngle);
  bridge.advance(1);
  assert.equal(first.spotlight.range, 10, 'source midpoint is never altered');
  assert.equal(first.spotlight.intensity, sourceIntensity);

  bridge.advance(1); // The original 2s warning has ended; no ghost beacon.
  assert.equal(first.active, false);
  assert.equal(first.spotlight.range, 0);
  assert.deepEqual(first.spotlight.direction, baseForward);
  assert.deepEqual(first.spotlight.right, baseRight);
  assert.deepEqual(first.spotlight.up, baseUp);
  assert.equal(first.spotlight.spotAngle, sourceAngle);
  assert.equal(first.spotlight.intensity, sourceIntensity);
  bridge.reset();
  assert.equal(packets.filter(packet => packet.active).length, 0);
  assert.equal(noPrecomputedWorldCatalog['level10::7089'].spotlight.position, undefined,
    'the original source catalog remains untouched');
});

test('J4 nearby Dojo player draws only the already active warning beam toward the threat', () => {
  const bridge = createDojoDoorWarningBridge(browserScene());
  const packets = bridge.packets();
  const beacon = packets[0];
  const initialDirection = [...beacon.spotlight.direction];
  const vectors = [beacon.spotlight.direction, beacon.spotlight.right, beacon.spotlight.up];

  bridge.accept(warning(103));
  bridge.advance(1, { x: 9, y: 1.8, z: -15 });
  assert.equal(bridge.packets(), packets, 'reactive lighting never creates draw packets');
  assert.equal(packets.filter(packet => packet.active).length, 1);
  assert.ok(beacon.spotlight.direction[2] > 0.10,
    'a nearby player in front of doorway 103 attracts its active beam');
  vectors.forEach((axis, index) => {
    assert.equal(axis, [beacon.spotlight.direction, beacon.spotlight.right, beacon.spotlight.up][index],
      'the existing GPU-facing vector buffers are reused');
    assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-9);
  });
  assert.equal(beacon.spotlight.range, 10, 'the source envelope is untouched');
  assert.equal(packets[1].active, false);
  assert.equal(packets[2].active, false);

  bridge.reset();
  assert.deepEqual(beacon.spotlight.direction, initialDirection);
  bridge.accept(warning(103));
  bridge.advance(1, { x: 30, y: 1.8, z: -15 });
  assert.ok(Math.abs(beacon.spotlight.direction[2]) < 0.001,
    'a player behind the light does not become an x-ray aim target');

  bridge.reset();
  bridge.accept(warning(103));
  bridge.advance(1, { x: 9, y: Number.NaN, z: -15 });
  assert.ok(Math.abs(beacon.spotlight.direction[2]) < 0.001,
    'an invalid camera position falls back to the original Web sweep');

  bridge.advance(1);
  assert.equal(beacon.active, false);
  assert.deepEqual(beacon.spotlight.direction, initialDirection,
    'the beam and its targeting vanish at source warning completion');
});
