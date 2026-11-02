import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MCD_GUN_ATTACK_BRANCH, MCD_GUN_CUE,
  classifyMcdGunAttack, selectBaseGunFireCue, selectGunDryFireCue,
  createGeneratedMcdGunCueSink,
} from '../src/sound/mcd-gun-cues.js';

const base = Object.freeze({
  thrown: false, weaponReady: true, additionalCheckPassed: true,
  ammoCount: 6, noShootingActive: false,
});
const classify = (change) => classifyMcdGunAttack({ ...base, ...change });

test('Gun.Attack early guards prevent both fire and dry-fire', () => {
  for (const change of [{thrown: true}, {weaponReady: false}, {additionalCheckPassed: false}]) {
    assert.equal(classify(change), MCD_GUN_ATTACK_BRANCH.BLOCKED);
    assert.equal(classify({...change, ammoCount: 0}), MCD_GUN_ATTACK_BRANCH.BLOCKED);
  }
});

test('positive ammo fires or throws under NoShooting; zero and negative differ', () => {
  assert.equal(classify({}), MCD_GUN_ATTACK_BRANCH.FIRE);
  assert.equal(classify({noShootingActive: true}), MCD_GUN_ATTACK_BRANCH.THROW);
  assert.equal(classify({ammoCount: 0}), MCD_GUN_ATTACK_BRANCH.DRY_FIRE);
  assert.equal(classify({ammoCount: 0, noShootingActive: true}), MCD_GUN_ATTACK_BRANCH.DRY_FIRE);
  assert.equal(classify({ammoCount: -1}), MCD_GUN_ATTACK_BRANCH.THROW_EMPTY);
});

test('base Gun.Fire selects alternate only above 0.6 with non-null clip', () => {
  for (const v of [0, 0.6, 1]) {
    const cue = selectBaseGunFireCue({unityRandomValue: v, alternateClipPresent: false});
    assert.equal(cue.kind, MCD_GUN_CUE.PRIMARY);
    assert.equal(cue.params.mixerField, 'mixerGunshots');
    assert.equal(cue.params.volume, 0.6);
    assert.equal(cue.params.pitchRandomization, 0.15);
    assert.equal(cue.params.volumeRandomization, 0.15);
    assert.equal(cue.params.relativePitch, true);
    assert.equal(cue.params.startFromBeginning, true);
    assert.ok(Object.isFrozen(cue));
  }
  assert.equal(selectBaseGunFireCue({unityRandomValue: 0.6, alternateClipPresent: true}).kind, MCD_GUN_CUE.PRIMARY);
  assert.equal(selectBaseGunFireCue({unityRandomValue: 0.600001, alternateClipPresent: true}).kind, MCD_GUN_CUE.ALTERNATE);
});

test('Gun.FireNoAmmo mixer, gain and NoShooting gate match source branch', () => {
  const cue = selectGunDryFireCue({noShootingActive: false});
  assert.equal(cue.kind, MCD_GUN_CUE.EMPTY);
  assert.deepEqual(cue.params, {volume: 0.4, mixerField: 'mixerSfxEnvironment'});
  assert.equal(selectGunDryFireCue({noShootingActive: true}), null);
});

test('native branch inputs reject unknowns instead of inventing defaults', () => {
  assert.throws(() => classifyMcdGunAttack({}), /thrown/);
  assert.throws(() => classify({ammoCount: 1.5}), /ammoCount/);
  assert.throws(() => selectBaseGunFireCue({unityRandomValue: NaN, alternateClipPresent: true}), /unityRandomValue/);
  assert.throws(() => selectBaseGunFireCue({unityRandomValue: 2, alternateClipPresent: true}), /unityRandomValue/);
  assert.throws(() => selectBaseGunFireCue({unityRandomValue: 0.3}), /alternateClipPresent/);
  assert.throws(() => selectGunDryFireCue({}), /noShootingActive/);
});

test('replacement invokes only original Web synth methods, never original clips', () => {
  const calls = [];
  const sink = createGeneratedMcdGunCueSink({shoot: () => calls.push('synthetic-shot'), empty: () => calls.push('synthetic-empty')});
  assert.equal(sink(selectBaseGunFireCue({unityRandomValue: 0.8, alternateClipPresent: true})), true);
  assert.equal(sink(selectGunDryFireCue({noShootingActive: false})), true);
  assert.equal(sink({kind: 'unsupported'}), false);
  assert.equal(sink(null), false);
  assert.deepEqual(calls, ['synthetic-shot', 'synthetic-empty']);
});

test('sink cannot count asynchronous synthetic playback as delivered', async () => {
  const sink = createGeneratedMcdGunCueSink({shoot: () => Promise.reject(new Error('audio refused'))});
  assert.throws(() => sink(selectBaseGunFireCue({unityRandomValue: 0.2, alternateClipPresent: false})), /synchronously/);
  await new Promise((resolve) => setImmediate(resolve));
});
