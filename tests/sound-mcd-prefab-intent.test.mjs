import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MCD_PREFAB_SOUND_RESULT, planMcdAudioPrefabPlay, planMcdBodyKillShatterPrefab,
} from '../src/sound/mcd-prefab-sound-intent.js';

const present = (extra = {}) => ({
  prefabName: 'resolved-prefab-name', poolExists: true, reused: false,
  position: {x: 2, y: 4, z: -3}, pitchBeforeRequest: 1,
  ...extra,
});

test('missing prefab pool returns empty effect before accessing AudioSource facts', () => {
  assert.deepEqual(planMcdAudioPrefabPlay({prefabName: 'sound', poolExists: false}), {
    status: MCD_PREFAB_SOUND_RESULT.EMPTY_EFFECT, reason: 'pool-missing',
  });
});

test('new pooled prefab gets spatial Play request and registers playing entry', () => {
  assert.deepEqual(planMcdAudioPrefabPlay(present()), {
    status: MCD_PREFAB_SOUND_RESULT.PLAY_REQUEST,
    prefabName: 'resolved-prefab-name', position: {x: 2, y: 4, z: -3},
    pauseBeforeReuse: false, registerPlaying: true, spatialBlend: 1,
    mute: false, pitch: 1, zeroPitchWarning: false, action: 'AudioSource.Play',
  });
});

test('reusing pooled source pauses first and does not register a second playing entry', () => {
  const result = planMcdAudioPrefabPlay(present({reused: true}));
  assert.equal(result.pauseBeforeReuse, true);
  assert.equal(result.registerPlaying, false);
  assert.equal(result.action, 'AudioSource.Play');
});

test('positive randomization adds to existing source pitch, including on reuse', () => {
  const base = present({reused: true, pitchBeforeRequest: 0.7, pitchRandomization: 0.2});
  for (const [sample, expected] of [[0, 0.5], [0.5, 0.7], [1, 0.9]]) {
    assert.ok(Math.abs(planMcdAudioPrefabPlay({...base, unityRandomValue: sample}).pitch - expected) < 1e-12);
  }
});

test('zero or negative randomization does not consume random input', () => {
  assert.equal(planMcdAudioPrefabPlay(present({pitchRandomization: 0})).pitch, 1);
  assert.equal(planMcdAudioPrefabPlay(present({pitchRandomization: -10})).pitch, 1);
  assert.throws(() => planMcdAudioPrefabPlay(present({pitchRandomization: 0.2})), /unityRandomValue/);
});

test('pitch zero warns but does not prevent Play', () => {
  const result = planMcdAudioPrefabPlay(present({pitchBeforeRequest: 0}));
  assert.equal(result.zeroPitchWarning, true);
  assert.equal(result.status, MCD_PREFAB_SOUND_RESULT.PLAY_REQUEST);
});

test('body already dead never requests enemy shatter prefab', () => {
  assert.equal(planMcdBodyKillShatterPrefab({bodyAlreadyDead: true}), null);
});

test('body kill sends enemy shatter to position lifted 1.5 Unity units', () => {
  const result = planMcdBodyKillShatterPrefab({
    bodyAlreadyDead: false, bodyWorldPosition: {x: 3, y: -2, z: 9},
    resolvedPrefabName: 'resolved-enemy-shatter', poolExists: true,
    reused: false, pitchBeforeRequest: 0.85,
  });
  assert.deepEqual(result.position, {x: 3, y: -0.5, z: 9});
  assert.equal(result.prefabName, 'resolved-enemy-shatter');
  assert.equal(result.pitch, 0.85);
  assert.equal(result.action, 'AudioSource.Play');
});

test('missing enemy shatter pool yields empty effect, not a played sound', () => {
  const result = planMcdBodyKillShatterPrefab({
    bodyAlreadyDead: false, bodyWorldPosition: {x: 0, y: 0, z: 0},
    resolvedPrefabName: 'unknown-prefab-name', poolExists: false,
  });
  assert.equal(result.status, MCD_PREFAB_SOUND_RESULT.EMPTY_EFFECT);
});

test('inputs are not retained by reference and explicit state is required', () => {
  const origin = {x: 1, y: 2, z: 3};
  const result = planMcdAudioPrefabPlay(present({position: origin}));
  origin.x = 99;
  assert.equal(result.position.x, 1);
  assert.equal(Object.isFrozen(result.position), true);
  assert.throws(() => planMcdAudioPrefabPlay(present({poolExists: null})), /poolExists/);
  assert.throws(() => planMcdAudioPrefabPlay(present({pitchRandomization: 0.1, unityRandomValue: 1.1})), /unityRandomValue/);
});
