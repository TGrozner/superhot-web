import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MCD_CONTAINERS_SERIALIZED_TIME_SCENE,
  MCD_DOJO_SERIALIZED_TIME_SCENE,
  qualifyMcdGameplayClockScene,
  createMcdGameplayClock,
  createSceneQualifiedMcdGameplayClock,
  stepMcdGameplayClock,
} from '../src/time.js';

test('Dojo/build10 qualifies only the serialized TimeControl denominator, not a runtime schedule', () => {
  const result = createSceneQualifiedMcdGameplayClock({
    sceneSource: MCD_DOJO_SERIALIZED_TIME_SCENE,
    yaw: 1.2,
    pitch: -0.3,
  });
  assert.deepEqual(result.qualification, {
    status: 'DOJO_SERIALIZED_TIME_PROFILE_ONLY',
    sourceQualified: true,
    fixedTimestepDenominator: 120,
    nativeRuntimeObserved: false,
  });
  assert.equal(Object.isFrozen(result.qualification), true);
  assert.equal(result.clock.source.fixedDeltaTime, Math.fround(1 / 120));
  // The full Web model remains provisional: source only establishes the
  // serialized denominator, not Unity's running timer or Animator clock.
  assert.deepEqual(result.clock, createMcdGameplayClock({yaw: 1.2, pitch: -0.3}));
});

test('Dojo and Containers both serialize 120 but have separate source identities and clock states', () => {
  const dojo = createSceneQualifiedMcdGameplayClock({sceneSource: {...MCD_DOJO_SERIALIZED_TIME_SCENE}});
  const containers = createSceneQualifiedMcdGameplayClock({
    sceneSource: {...MCD_CONTAINERS_SERIALIZED_TIME_SCENE},
  });
  assert.equal(dojo.qualification.status, 'DOJO_SERIALIZED_TIME_PROFILE_ONLY');
  assert.equal(containers.qualification.status, 'CONTAINERS_SERIALIZED_TIME_PROFILE_ONLY');
  assert.equal(dojo.qualification.nativeRuntimeObserved, false);
  assert.equal(containers.qualification.nativeRuntimeObserved, false);
  assert.notEqual(dojo.clock, containers.clock);
  assert.notEqual(dojo.clock.source, containers.clock.source);
  const tick = stepMcdGameplayClock(dojo.clock, {dt: 1 / 60});
  assert.equal(tick.worldDelta, Math.fround(1 / 60));
  assert.equal(containers.clock.realTime, 0);
});

test('unknown or incomplete scene metadata never activates a source-qualified Web clock', () => {
  for (const partial of [
    null,
    undefined,
    {},
    {sceneBuildIndex: 10},
    {sceneBuildIndex: 28},
    {sceneBuildIndex: 99, scenePath: 'Assets/Scenes/Unknown.unity', serializedOwner: 'level99'},
    {...MCD_CONTAINERS_SERIALIZED_TIME_SCENE, serializedOwner: 'level10'},
    {...MCD_CONTAINERS_SERIALIZED_TIME_SCENE, sceneBuildIndex: 10},
    {...MCD_CONTAINERS_SERIALIZED_TIME_SCENE, scenePath: MCD_DOJO_SERIALIZED_TIME_SCENE.scenePath},
    {...MCD_DOJO_SERIALIZED_TIME_SCENE, serializedOwner: 'level28'},
    {...MCD_DOJO_SERIALIZED_TIME_SCENE, sceneBuildIndex: 28},
    {...MCD_DOJO_SERIALIZED_TIME_SCENE, scenePath: MCD_CONTAINERS_SERIALIZED_TIME_SCENE.scenePath},
    {...MCD_DOJO_SERIALIZED_TIME_SCENE, scenePath: MCD_DOJO_SERIALIZED_TIME_SCENE.scenePath.toUpperCase()},
  ]) {
    const qualification = qualifyMcdGameplayClockScene(partial);
    assert.deepEqual(qualification, {
      status: 'NATIVE_SCENE_TIME_UNKNOWN',
      sourceQualified: false,
      fixedTimestepDenominator: null,
      nativeRuntimeObserved: false,
    });
    assert.equal(createSceneQualifiedMcdGameplayClock({sceneSource: partial}).clock, null);
  }
});

test('a serialized denominator does not certify execution or override live Dojo gameplay by itself', () => {
  const source = MCD_DOJO_SERIALIZED_TIME_SCENE;
  const qualified = qualifyMcdGameplayClockScene(source);
  assert.equal(qualified.sourceQualified, true);
  assert.equal(qualified.nativeRuntimeObserved, false);
  assert.equal(Object.isFrozen(qualified), true);
  // Opt-in factory must not mutate source metadata or any existing clock.
  const oldWebClock = createMcdGameplayClock({yaw: 0.5});
  const {clock} = createSceneQualifiedMcdGameplayClock({sceneSource: source, yaw: -0.5});
  assert.equal(oldWebClock.yaw, 0.5);
  assert.equal(clock.yaw, -0.5);
  assert.equal(qualified.fixedTimestepDenominator, 120);
});
