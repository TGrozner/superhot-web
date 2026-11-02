import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../src/audio.js';
import { planMcdLocalStunSceneAudio } from '../src/sound/mcd-stun-scene-plan.js';

const supported = {
  resourcePresent: { EnemyStun: true, EnemyStunConcrete: true },
  diagnosticMaxDistance: 40,
};

test('source clip identities and declared prefab sizes fit the REAL createAudio scene descriptor', () => {
  const plan = planMcdLocalStunSceneAudio(supported);
  const normalKey = 'audioNative_resources_assets_1675';
  const concreteKey = 'audioNative_resources_assets_1611';
  assert.deepEqual(plan.localManifestKeys, [normalKey, concreteKey]);
  assert.deepEqual(plan.sceneAudio.clips[normalKey], {
    manifestKey: normalKey,
    owner: 'resources.assets', pathId: 1675, name: 'AC_Enemy_Stun',
  });
  assert.deepEqual(plan.sceneAudio.clips[concreteKey], {
    manifestKey: concreteKey,
    owner: 'resources.assets', pathId: 1611, name: 'AC_Enemy_Hit',
  });
  assert.equal(plan.sceneAudio.prefabs.EnemyStun.poolSize, 3);
  assert.equal(plan.sceneAudio.prefabs.EnemyStunConcrete.poolSize, 2);
  assert.equal(plan.sceneAudio.prefabs.EnemyStun.gain, 0.6340000033378601);
  assert.equal(plan.sceneAudio.prefabs.EnemyStunConcrete.gain, 0.699999988079071);
  assert.equal(plan.sceneAudio.prefabs.EnemyStun.pitch, 1);
  assert.equal(plan.sceneAudio.prefabs.EnemyStunConcrete.maxDistance, 40);
  assert.equal('mixerGroup' in plan.sceneAudio.prefabs.EnemyStun, false);

  const browser = createAudio();
  assert.deepEqual(browser.configureSceneAudio(plan.sceneAudio), { clips: 12, prefabs: 2 });
  assert.equal(browser.getMetrics().assets[normalKey].pathId, 1675);
  assert.equal(browser.getMetrics().assets[concreteKey].pathId, 1611);
  assert.equal(browser.getMetrics().assets[normalKey].loaded, false);
  assert.equal(plan.nativeRuntimePoolVerified, false);
  assert.equal(plan.browserGraphVerified, false);
  assert.equal(plan.speakerAudibilityVerified, false);
});

test('a missing or UNKNOWN original Resources.Load result cannot produce a Web prefab', () => {
  const plan = planMcdLocalStunSceneAudio({
    resourcePresent: { EnemyStun: false, EnemyStunConcrete: 'unknown' },
  });
  assert.deepEqual(plan.sceneAudio.prefabs, {});
  assert.deepEqual(plan.sceneAudio.clips, {});
  assert.deepEqual(plan.localManifestKeys, []);
  assert.deepEqual(plan.decisions.map(x => x.status), [
    'local-resource-absent', 'local-resource-unverified',
  ]);
});

test('one local prefab is opt-in without silently asserting the other', () => {
  const plan = planMcdLocalStunSceneAudio({
    resourcePresent: { EnemyStun: true, EnemyStunConcrete: 'unknown' },
    diagnosticMaxDistance: 18,
  });
  assert.deepEqual(Object.keys(plan.sceneAudio.prefabs), ['EnemyStun']);
  assert.deepEqual(plan.localManifestKeys, ['audioNative_resources_assets_1675']);
});

test('source Stun cooldown advances when a diagnostic Web pool has no decoded local clip', () => {
  const browser = createAudio();
  browser.configureSceneAudio(planMcdLocalStunSceneAudio(supported).sceneAudio);
  browser.setOriginalMode(true);
  const first = browser.stun({
    bodyId: 'enemy-1', position: {x: 2, y: 3, z: 4}, realtimeSeconds: 10,
  });
  assert.equal(first.status, 'blocked');
  assert.equal(first.reason, 'audio-context-not-initialized');
  assert.equal(first.clipId, 'audioNative_resources_assets_1675');
  const tooEarly = browser.stun({
    bodyId: 'enemy-1', position: {x: 2, y: 3, z: 4}, realtimeSeconds: 10.25,
  });
  assert.equal(tooEarly.status, 'suppressed');
  assert.equal(tooEarly.reason, 'native-stun-sound-rest');
  // A new body has its own source sound rest, despite the first blocked request.
  const another = browser.stun({
    bodyId: 'enemy-2', position: {x: 2, y: 3, z: 4},
    concrete: true, realtimeSeconds: 10,
  });
  assert.equal(another.status, 'blocked');
  assert.equal(another.clipId, 'audioNative_resources_assets_1611');
});

test('unverified prefab remains blocked, and the same Web cooldown still progresses', () => {
  const browser = createAudio();
  browser.configureSceneAudio(planMcdLocalStunSceneAudio({
    resourcePresent: { EnemyStun: 'unknown', EnemyStunConcrete: false },
  }).sceneAudio);
  browser.setOriginalMode(true);
  const args = {bodyId: 'enemy', position: {x: 0, y: 0, z: 0}, realtimeSeconds: 10};
  const first = browser.stun(args);
  assert.equal(first.status, 'blocked');
  assert.equal(first.reason, 'native-prefab-not-configured');
  const second = browser.stun({...args, realtimeSeconds: 10.2});
  assert.equal(second.status, 'suppressed');
  assert.equal(second.reason, 'native-stun-sound-rest');
});

test('explicit preview distance and occupied native bindings are never silently invented/overwritten', () => {
  assert.throws(() => planMcdLocalStunSceneAudio({resourcePresent: {EnemyStun: true, EnemyStunConcrete: false}}), /diagnosticMaxDistance/);
  assert.throws(() => planMcdLocalStunSceneAudio({
    resourcePresent: {EnemyStun: true, EnemyStunConcrete: true},
    diagnosticMaxDistance: 20,
    existingSceneAudio: {prefabs: { EnemyStun: {source: 'existing-native-package'} }},
  }), /already configured/);
  assert.throws(() => planMcdLocalStunSceneAudio({
    resourcePresent: {EnemyStun: true, EnemyStunConcrete: 'maybe'},
    diagnosticMaxDistance: 20,
  }), /presence/);
});
