import test from 'node:test';
import assert from 'node:assert/strict';
import { createDojoDoorWarningBridge, DOJO_DOOR_SOURCE_BINDINGS } from '../src/scenes/dojo-door-warning-bridge.js';

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
  assert.equal(bridge.advance(0.5)[0].spotlight.range, 5);
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
