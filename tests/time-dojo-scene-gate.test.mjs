import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MCD_CONTAINERS_SERIALIZED_TIME_SCENE,
  qualifyMcdGameplayClockScene,
  createSceneQualifiedMcdGameplayClock,
  stepMcdGameplayClock,
} from '../src/time.js';

const DOJO = Object.freeze({
  sceneBuildIndex: 10,
  scenePath: 'Assets/Scenes/SHRL/SHRL_Dojo2/SHRL_Dojo2.unity',
  serializedOwner: 'level10',
});

test('Dojo/build10 must not inherit the Containers/level28 serialized 120 denominator', () => {
  const result = createSceneQualifiedMcdGameplayClock({
    sceneSource: DOJO,
    yaw: 1.2,
    pitch: -0.3,
  });
  assert.equal(result.clock, null);
  assert.deepEqual(result.qualification, {
    status: 'NATIVE_SCENE_TIME_UNKNOWN',
    sourceQualified: false,
    fixedTimestepDenominator: null,
    nativeRuntimeObserved: false,
  });
  assert.equal(Object.isFrozen(result.qualification), true);
});

test('only all three serialized source-identity fields qualify Containers', () => {
  const source = MCD_CONTAINERS_SERIALIZED_TIME_SCENE;
  for (const partial of [
    null,
    undefined,
    {},
    { sceneBuildIndex: 28 },
    { ...source, serializedOwner: 'level10' },
    { ...source, sceneBuildIndex: 10 },
    { ...source, scenePath: DOJO.scenePath },
    { ...source, scenePath: source.scenePath.toUpperCase() },
  ]) {
    const qualification = qualifyMcdGameplayClockScene(partial);
    assert.equal(qualification.sourceQualified, false);
    assert.equal(qualification.fixedTimestepDenominator, null);
    assert.equal(createSceneQualifiedMcdGameplayClock({ sceneSource: partial }).clock, null);
  }
});

test('an exact Containers tuple supplies an isolated clock but proves no executed native frame', () => {
  const source = { ...MCD_CONTAINERS_SERIALIZED_TIME_SCENE };
  const first = createSceneQualifiedMcdGameplayClock({ sceneSource: source, yaw: 0.2, pitch: 0.1 });
  const second = createSceneQualifiedMcdGameplayClock({ sceneSource: source });
  assert.equal(first.qualification.sourceQualified, true);
  assert.equal(first.qualification.nativeRuntimeObserved, false);
  assert.equal(first.qualification.fixedTimestepDenominator, 120);
  assert.equal(first.qualification.status, 'CONTAINERS_SERIALIZED_TIME_PROFILE_ONLY');
  assert.equal(first.clock.source.fixedDeltaTime, Math.fround(1 / 120));
  assert.notEqual(first.clock, second.clock);
  const stepped = stepMcdGameplayClock(first.clock, { dt: 1 / 60 });
  assert.equal(stepped.worldDelta, Math.fround(1 / 60));
  assert.equal(second.clock.realTime, 0);
});

test('untrusted metadata cannot certify Dojo even when it copies Containers owner', () => {
  const mixed = { ...DOJO, serializedOwner: 'level28' };
  assert.equal(qualifyMcdGameplayClockScene(mixed).sourceQualified, false);
  assert.equal(qualifyMcdGameplayClockScene({ ...DOJO, sceneBuildIndex: 28 }).sourceQualified, false);
});
