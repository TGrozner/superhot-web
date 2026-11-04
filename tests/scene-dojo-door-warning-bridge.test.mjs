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
    const fillTravel = Math.hypot(...packet.falseLight.position.map(
      (value, axis) => value - expected.falseLight[axis]));
    assert.ok(fillTravel > 0.35 && fillTravel < 1.8,
      'at source midpoint the Web red fill now travels within its bounded doorway path');
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
    packet.falseLight.position.forEach((value, axis) =>
      assert.ok(Math.abs(value - expectedWorld[index].falseLight[axis]) < 0.00001,
        'REJOUER restores the exact authored initial false-light pose'));
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

test('J4 accepted Dojo spawn point turns the existing beacon into an incoming-route telegraph', () => {
  const bridge = createDojoDoorWarningBridge(browserScene());
  const packet = bridge.packets()[0];
  const packets = bridge.packets();
  const initialDirection = packet.spotlight.direction;
  const target = { x: 10, y: 1.7, z: -14 };
  const event = warning(103);
  event.point.position = target;
  assert.equal(bridge.accept(event).status, 'triggered');
  target.z = 50; // Accepted event is snapshotted; later gameplay mutations must not redirect light.
  bridge.advance(1);
  assert.equal(bridge.packets(), packets, 'the live render packets are reused');
  assert.equal(packet.spotlight.direction, initialDirection, 'the GPU-facing vector stays allocated');
  assert.ok(packet.spotlight.direction[2] > 0.12,
    'mid-warning cone now indicates the accepted spawn direction, not just a blind sweep');
  assert.equal(bridge.packets().filter(p => p.active).length, 1,
    'targeting never turns on a second door or a fabricated light');

  bridge.reset();
  assert.equal(bridge.accept(warning(103)).status, 'triggered');
  bridge.advance(1);
  assert.ok(Math.abs(packet.spotlight.direction[2]) < 0.001,
    'REJOUER and a new point without coordinates do not reuse the previous target');

  bridge.reset();
  const behind = warning(103);
  behind.point.position = { x: 19, y: 1.7, z: -14 };
  assert.equal(bridge.accept(behind).status, 'triggered');
  bridge.advance(1);
  assert.ok(Math.abs(packet.spotlight.direction[2]) < 0.001,
    'a spawn behind the source door does not turn the beam through the wall');

  bridge.reset();
  const invalid = warning(103);
  invalid.point.position = { x: NaN, y: 1.7, z: -14 };
  assert.equal(bridge.accept(invalid).status, 'triggered');
  bridge.advance(1);
  assert.ok(Math.abs(packet.spotlight.direction[2]) < 0.001,
    'unqualified position never makes a fabricated spawn target');
  bridge.advance(1);
  assert.equal(packet.active, false);
  assert.equal(packet.spotlight.range, 0);
});

test('J4 Dojo arrival crescendo intensifies only existing door lights then fully releases', () => {
  const bridge = createDojoDoorWarningBridge(browserScene());
  const packets = bridge.packets();
  const beam = packets[0];
  const spotDirection = beam.spotlight.direction;
  assert.equal(bridge.accept(warning(103)).status, 'triggered');

  bridge.advance(1); // First half: the existing Web sweep is unchanged.
  assert.equal(beam.spotlight.intensity, 30);
  assert.equal(beam.falseLight.intensity, 4);
  assert.equal(beam.spotlight.spotAngle, 99);

  bridge.advance(0.5); // One broad final-approach cue, not a flashing strobe.
  assert.equal(bridge.packets(), packets, 'no extra lights or GPU packets');
  assert.equal(beam.spotlight.direction, spotDirection, 'reuse the live GPU basis');
  assert.ok(beam.spotlight.intensity > 40, 'the red cone becomes more prominent');
  assert.ok(beam.falseLight.intensity > 4.5, 'the existing fill light visibly swells');
  assert.ok(beam.spotlight.spotAngle < 55, 'the arrival cone focuses on the door');
  assert.deepEqual(packets.slice(1).map(packet => packet.active), [false, false],
    'other warning doors never flash on their own');

  bridge.advance(0.45); // Source envelope is nearly extinguished at 1.95/2s.
  assert.ok(beam.falseLight.intensity < 0.1,
    'the creative emphasis also fades before the source warning ends');
  bridge.advance(0.05);
  assert.equal(beam.active, false);
  assert.equal(beam.spotlight.range, 0);
  assert.equal(beam.falseLight.intensity, 0);
  assert.equal(beam.spotlight.intensity, 30);
  assert.equal(beam.spotlight.spotAngle, 99);
  bridge.reset();
  assert.equal(bridge.packets(), packets);
  assert.deepEqual(packets.map(packet => packet.active), [false, false, false]);
});

test('J4 door red wash travels through the active doorway and returns without new lights', () => {
  const input = browserScene();
  const bridge = createDojoDoorWarningBridge(input);
  const packets = bridge.packets();
  const active = packets[0];
  const fillBuffer = active.falseLight.position;
  const sourcePosition = [...fillBuffer];
  const otherPositions = packets.slice(1).map(p => [...p.falseLight.position]);
  assert.equal(input.gameplay.audio.doors['level10::7089'].falseLight.position, undefined,
    'serialized light input is not mutated by the Web presentation');

  assert.equal(bridge.accept(warning(103)).status, 'triggered');
  bridge.advance(1.5); // 75%: the single Web-authored red wash is near its maximum.
  assert.equal(bridge.packets(), packets);
  assert.equal(active.falseLight.position, fillBuffer,
    'the source false-light buffer is reused, never replaced per frame');
  assert.ok(fillBuffer[0] < sourcePosition[0] - 0.8,
    'the existing red fill travels forward through door 103');
  assert.equal(fillBuffer[1], sourcePosition[1],
    'the red wash stays at the authored lamp elevation');
  assert.deepEqual(packets.slice(1).map(p => p.falseLight.position), otherPositions,
    'inactive door fills are never animated or enabled');
  assert.deepEqual(packets.slice(1).map(p => p.active), [false, false]);

  bridge.advance(0.5);
  assert.equal(active.active, false);
  assert.equal(active.falseLight.intensity, 0);
  assert.deepEqual(fillBuffer, sourcePosition, 'source expiration restores lamp pose');

  bridge.accept(warning(103));
  bridge.advance(1.5, { x: 9, y: 1.8, z: -15 });
  assert.equal(active.falseLight.position, fillBuffer,
    'player-reactive targeting moves the existing fill, not another light');
  assert.ok(Math.hypot(...fillBuffer.map((v, axis) => v - sourcePosition[axis])) > 0.8);
  bridge.reset();
  assert.deepEqual(fillBuffer, sourcePosition, 'REJOUER restores fill with no ghost spill');
  assert.equal(active.falseLight.slot, -1);
  assert.equal(input.gameplay.audio.doors['level10::7089'].falseLight.position, undefined);

  // A source package with unverified bases must not invent a moving red patch.
  const unverified = createDojoDoorWarningBridge(browserScene({
    coordinateSpace: { browserFromUnity: 'unverified' },
  }));
  unverified.accept(warning(103));
  unverified.advance(1.5);
  assert.equal(unverified.packets()[0].falseLight.position, undefined);
});

test('J4 overlapping Dojo door arrivals focus the imminent entrance without a new render packet', () => {
  const bridge = createDojoDoorWarningBridge(browserScene());
  const packets = bridge.packets();
  const [first, second, idle] = packets;
  const originalPacketRefs = [...packets];
  const originalBasisRefs = packets.map(packet => packet.spotlight.direction);

  assert.equal(bridge.accept(warning(103)).status, 'triggered');
  bridge.advance(0.9);
  assert.equal(bridge.accept(warning(221)).status, 'triggered');
  bridge.advance(0.25); // first at 1.15s, second at 0.25s
  assert.equal(bridge.packets(), packets, 'the same three GPU-facing packets are reused');
  assert.deepEqual(packets, originalPacketRefs, 'no new light records are created');
  packets.forEach((packet, index) =>
    assert.equal(packet.spotlight.direction, originalBasisRefs[index]));
  assert.deepEqual(packets.map(packet => packet.active), [true, true, false]);
  assert.deepEqual(packets.map(packet => packet.falseLight.slot), [0, 1, -1]);
  assert.ok(first.spotlight.intensity > 34,
    'the nearer arrival becomes the brighter directional cue');
  assert.ok(second.spotlight.intensity < 30,
    'the newly started second alarm remains visible without competing at full power');
  assert.ok(first.falseLight.intensity > second.falseLight.intensity);
  assert.equal(idle.spotlight.range, 0);
  assert.equal(idle.falseLight.intensity, 0);

  const before = second.spotlight.intensity;
  bridge.advance(0.01);
  assert.ok(Math.abs(second.spotlight.intensity - before) < 3,
    'priority adapts smoothly instead of jumping a whole intensity band in one tick');

  bridge.advance(1); // first expires, second continues alone
  assert.equal(first.active, false);
  assert.equal(second.active, true);
  const solo = createDojoDoorWarningBridge(browserScene());
  solo.accept(warning(221));
  solo.advance(1.26);
  assert.ok(Math.abs(second.spotlight.intensity - solo.packets()[1].spotlight.intensity) < 0.1,
    'remaining active door smoothly regains its ordinary solo intensity');

  bridge.reset();
  assert.deepEqual(packets.map(packet => packet.active), [false, false, false]);
  assert.deepEqual(packets.map(packet => packet.falseLight.slot), [-1, -1, -1]);
  assert.equal(first.spotlight.intensity, 30);
  assert.equal(second.spotlight.intensity, 30);
  assert.equal(first.falseLight.intensity, 0);
  assert.equal(second.falseLight.intensity, 0);

  // Synchronized warnings are balanced; no arbitrary door ID wins.
  bridge.accept(warning(103));
  bridge.accept(warning(221));
  bridge.advance(0.5);
  assert.ok(Math.abs(first.spotlight.intensity - second.spotlight.intensity) < 1e-9);
  assert.ok(Math.abs(first.falseLight.intensity - second.falseLight.intensity) < 1e-9);
});

test('J4 reactive Dojo doorway tracking eases abrupt player movements without delaying the base sweep', () => {
  const tracked = createDojoDoorWarningBridge(browserScene());
  const neutral = createDojoDoorWarningBridge(browserScene());
  tracked.accept(warning(103));
  neutral.accept(warning(103));
  tracked.advance(0.5);
  neutral.advance(0.5);
  const active = tracked.packets()[0];
  const directionBuffer = active.spotlight.direction;
  const eye = { x: 9, y: 1.8, z: -15 };
  const difference = () => Math.hypot(...directionBuffer.map((v, i) =>
    v - neutral.packets()[0].spotlight.direction[i]));

  tracked.advance(0.016, eye);
  neutral.advance(0.016);
  const firstFrame = difference();
  assert.ok(firstFrame > 0.001 && firstFrame < 0.12,
    'a 16ms player movement nudges the beam instead of instantly snapping to its target');
  for (let i = 0; i < 12; i++) {
    tracked.advance(0.016, eye);
    neutral.advance(0.016);
  }
  const settled = difference();
  assert.ok(settled > firstFrame * 1.5,
    'stable player tracking gradually establishes a stronger beam cue');

  // Player crosses behind the wall: reactive steering must release smoothly,
  // without freezing the original sweeps or leaving an x-ray aim permanently.
  tracked.advance(0.016, { x: 30, y: 1.8, z: -15 });
  neutral.advance(0.016);
  const releasing = difference();
  assert.ok(releasing > 0 && releasing < settled,
    'invalid/behind player aim decays rather than flipping abruptly');
  for (let i = 0; i < 30; i++) {
    tracked.advance(0.016, { x: 30, y: 1.8, z: -15 });
    neutral.advance(0.016);
  }
  assert.ok(difference() < 0.01, 'the source-qualified lighthouse resumes its neutral sweep');
  assert.equal(active.spotlight.direction, directionBuffer, 'the GPU vector remains stable');
  tracked.reset();
  assert.deepEqual(active.spotlight.direction, [-0.99999999982, 0, 0.00001898408]);
  assert.equal(active.active, false);
});

test('J4 overlapping door lights prioritize the actual unscaled enemy arrival, not world-time elapsed', () => {
  const bridge = createDojoDoorWarningBridge(browserScene());
  const packets = bridge.packets();
  const slow = warning(103);
  const fast = warning(221);
  slow.delay = 4;
  fast.delay = 0.7;
  assert.equal(bridge.accept(slow).status, 'triggered');
  assert.equal(bridge.accept(fast).status, 'triggered');

  bridge.advance(0.5, null, 0.2);
  assert.deepEqual(packets.map(p => p.active), [true, true, false]);
  assert.ok(packets[1].spotlight.intensity > packets[0].spotlight.intensity,
    'the sooner arrival lights up despite both source curves being at the same phase');
  const fastBeforeArrival = packets[1].spotlight.intensity;

  // The spawner runs on unscaled time: a completed arrival releases priority
  // even when SUPERHOT world time and the underlying source curve freeze.
  bridge.advance(0, null, 0.6);
  assert.equal(packets[1].active, true, 'the world-clock source light still runs independently');
  assert.ok(packets[1].spotlight.intensity < fastBeforeArrival);
  assert.ok(packets[0].spotlight.intensity > packets[1].spotlight.intensity,
    'a completed arrival no longer overshadows an upcoming entrance');
  assert.equal(bridge.packets(), packets, 'no new draw packets or per-frame array replacement');

  bridge.reset();
  assert.deepEqual(packets.map(p => p.active), [false, false, false]);
  assert.deepEqual(packets.map(p => p.falseLight.slot), [-1, -1, -1]);

  // Until SH-05 connects the unscaled clock, preserve the old visual ranking.
  const compatible = createDojoDoorWarningBridge(browserScene());
  compatible.accept(slow);
  compatible.accept(fast);
  compatible.advance(0.5);
  assert.ok(Math.abs(compatible.packets()[0].spotlight.intensity -
    compatible.packets()[1].spotlight.intensity) < 1e-9);
  assert.throws(() => compatible.advance(0, null, -0.01), /unscaledDeltaSeconds/);
  assert.throws(() => compatible.advance(0, null, Infinity), /unscaledDeltaSeconds/);
});
