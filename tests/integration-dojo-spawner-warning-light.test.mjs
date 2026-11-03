import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeSpawnerState, advanceNativeSpawner } from '../src/combat/native-spawner.js';
import { createDojoDoorWarningBridge } from '../src/scenes/dojo-door-warning-bridge.js';
import { prepareDojoDoorWarningLighting } from '../src/render/lighting-model.js';

// SH-16 cross-lane runtime-API integration. All fixtures below are synthetic;
// source IDs are public non-asset metadata. No original shader, cookie or frame
// is embedded, and a prepared light is not a rendered pixel.
const source = {
  sceneBuildIndex: 10,
  serializedOwner: 'level10',
  scenePath: 'Assets/Scenes/SHRL/SHRL_Dojo2.unity',
};
const doorId = 'level10::7089';
const cookieId = 'synthetic-cookie-not-a-texture';
const curve = [
  { time: 0, value: 0, inSlope: 0, outSlope: 0 },
  { time: 1, value: 1, inSlope: 0, outSlope: 0 },
  { time: 2, value: 0, inSlope: 0, outSlope: 0 },
];
const catalog = {
  [doorId]: {
    curve,
    rendererId: 'synthetic-renderer',
    spotlight: {
      range: 10, intensity: 3, color: [1, 0, 0], spotAngle: 90,
      cullingMask: 256, cookieTextureId: cookieId,
      position: [0, 2, 0], direction: [0, 0, -1],
      right: [1, 0, 0], up: [0, 1, 0],
    },
    falseLight: { intensity: 2, position: [0, 2, 1] },
  },
};
const scene = () => ({ source, gameplay: { audio: { doors: catalog } } });
const spawnSettings = Object.freeze({
  startDelay: 0, spawnDelay: 2, enemiesLeft: 1, maxEnemiesOnScene: 4,
  endless: false,
});
const point = () => ({
  id: 'web-anchor-name-must-not-be-used-as-source-id',
  source: { owner: 'level10', path_id: 103 },
  door: { redLightIntensityPickTime: 1 },
});
const spawner = candidate => {
  const rng = () => 0.25;
  const state = createNativeSpawnerState(spawnSettings, rng);
  const update = (scaledDeltaTime, unscaledDeltaTime) => advanceNativeSpawner(
    state, spawnSettings, {
      scaledDeltaTime, unscaledDeltaTime,
      enabled: true, spawningAreaInitialized: true, currentEnemyCount: 0,
      templates: ['web-pistol'],
      getEligiblePoints: () => [candidate],
    }, rng,
  );
  return { state, update };
};
const prepared = (bridge, opts = {}) => prepareDojoDoorWarningLighting(
  source, bridge.packets(), {
    verifiedDoorKeys: new Set([doorId]),
    decodedCookies: new Set([cookieId]),
    meshLayer: 8, ...opts,
  },
);

test('Dojo source spawner warning reaches world-clock bridge and SH-13 lighting before delayed spawn', () => {
  const s = spawner(point());
  const bridge = createDojoDoorWarningBridge(scene());
  assert.equal(bridge.readiness, 'source-catalog-present');

  const commands = s.update(0.125, 0.1);
  assert.deepEqual(commands.map(command => command.type), ['door-warning']);
  assert.equal(commands[0].point.source.path_id, 103);
  assert.equal(commands[0].delay, 2);
  assert.deepEqual(bridge.accept(commands[0]), {
    status: 'triggered', spawnPathId: 103, doorKey: doorId,
  });
  assert.equal(s.state.pending.length, 1, 'source spawn remains delayed');
  assert.equal(bridge.packets()[0].spotlight.range, 0,
    'trigger is not itself a light curve tick');
  bridge.advance(0);
  assert.equal(bridge.packets()[0].elapsed, 0);
  bridge.advance(0.5); // world time, independent of the unscaled spawn clock

  const light = prepared(bridge);
  assert.equal(light.nativeLightingParity, false);
  assert.equal(light.spotlights.length, 1, 'one source-qualified data packet');
  assert.equal(light.falseLights.length, 1);
  assert.equal(light.spotlights[0].doorId, doorId);
  assert.ok(light.spotlights[0].range > 0);
  assert.deepEqual(light.omissions, []);
  assert.equal(s.state.pending.length, 1, 'no premature actor');
  assert.equal(s.update(0, 2).map(command => command.type).join(','), 'spawn');
  assert.equal(s.state.pending.length, 0);
  bridge.advance(1.6);
  assert.equal(bridge.packets()[0].active, false);
  assert.equal(prepared(bridge).spotlights.length, 0);
  bridge.reset();
  assert.equal(bridge.packets()[0].falseLight.slot, -1);
});

test('Dojo warning cannot fake spotlights with wrong GO, missing cookie or excluded source layer', () => {
  const invalid = point();
  invalid.source = { owner: 'level28', path_id: 103 };
  const s = spawner(invalid);
  const bridge = createDojoDoorWarningBridge(scene());
  const warning = s.update(0.125, 0.1)[0];
  assert.equal(warning.type, 'door-warning');
  assert.equal(bridge.accept(warning).status, 'missing-verified-spawn-go');
  bridge.advance(0.5);
  assert.equal(prepared(bridge).spotlights.length, 0);

  const valid = spawner(point()).update(0.125, 0.1)[0];
  assert.equal(bridge.accept(valid).status, 'triggered');
  bridge.advance(0.5);
  const unmasked = prepared(bridge, { meshLayer: 7 });
  assert.equal(unmasked.spotlights.length, 0);
  assert.ok(unmasked.omissions.some(omission =>
    omission.reason === 'source-spotlight-layer-mask'));
  const undecoded = prepared(bridge, { decodedCookies: new Set() });
  assert.equal(undecoded.spotlights.length, 0);
  assert.ok(undecoded.omissions.some(omission =>
    omission.reason === 'source-cookie-not-decoded'));
  const unmatched = prepared(bridge, { verifiedDoorKeys: new Set() });
  assert.equal(unmatched.spotlights.length, 0);
  assert.ok(unmatched.omissions.some(omission =>
    omission.reason === 'unqualified-source-door-join'));
});
