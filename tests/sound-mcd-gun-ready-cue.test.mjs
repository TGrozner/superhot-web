import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMcdGunAttack, MCD_GUN_ATTACK_BRANCH,
} from '../src/sound/mcd-gun-cues.js';
import {
  MCD_GUN_READY_CUE, planMcdGunReadyInvoke, resolveMcdGunReadyCallback,
} from '../src/sound/mcd-gun-ready-cue.js';

const sourceInputs = Object.freeze({
  thrown: false, weaponReady: true, additionalCheckPassed: true,
  ammoCount: 2, noShootingActive: false,
});
function plan(changes = {}, readyClipPresent = true, requestedDelaySeconds = 0.35) {
  return planMcdGunReadyInvoke({
    attackBranch: classifyMcdGunAttack({...sourceInputs, ...changes}),
    readyClipPresent, requestedDelaySeconds,
  });
}

test('positive-ammo Gun.Attack branch schedules the exact requested delay', () => {
  assert.deepEqual(plan(), {
    kind: MCD_GUN_READY_CUE,
    callback: 'PlayReadyToShootSound', scheduler: 'Unity Invoke',
    requestedDelaySeconds: 0.35,
  });
  assert.equal(plan().requestedDelaySeconds, 0.35);
  assert.ok(Object.isFrozen(plan()));
});

test('ready sound is not scheduled for blocked, NoShooting, dry or empty branches', () => {
  for (const changes of [
    {thrown: true}, {weaponReady: false}, {additionalCheckPassed: false},
    {noShootingActive: true}, {ammoCount: 0}, {ammoCount: -1},
  ]) assert.equal(plan(changes), null);
  assert.equal(MCD_GUN_ATTACK_BRANCH.FIRE, classifyMcdGunAttack(sourceInputs));
});

test('null SFXReadyToShoot at fire time suppresses Invoke', () => {
  assert.equal(plan({}, false), null);
});

test('callback requests a volume-one environment-mixer clip, not a waveform', () => {
  const request = plan();
  assert.deepEqual(resolveMcdGunReadyCallback(request, {
    callbackInvoked: true, weaponThrownAtCallback: false,
  }), {
    kind: MCD_GUN_READY_CUE,
    params: { clipField: 'SFXReadyToShoot', volume: 1, mixerField: 'mixerSfxEnvironment' },
  });
});

test('weapon thrown AFTER fire but BEFORE callback suppresses PlayClip', () => {
  const request = plan();
  assert.equal(resolveMcdGunReadyCallback(request, {
    callbackInvoked: true, weaponThrownAtCallback: true,
  }), null);
});

test('scheduled callback not observed executed produces no PlayClip request', () => {
  assert.equal(resolveMcdGunReadyCallback(plan(), {
    callbackInvoked: false, weaponThrownAtCallback: false,
  }), null);
  assert.equal(resolveMcdGunReadyCallback(null, {}), null);
});

test('no invented default attack delay or callback-side state', () => {
  assert.throws(() => planMcdGunReadyInvoke({
    attackBranch: MCD_GUN_ATTACK_BRANCH.FIRE, readyClipPresent: true,
  }), /requestedDelaySeconds/);
  assert.throws(() => planMcdGunReadyInvoke({
    attackBranch: MCD_GUN_ATTACK_BRANCH.FIRE, readyClipPresent: true,
    requestedDelaySeconds: Infinity,
  }), /requestedDelaySeconds/);
  assert.throws(() => planMcdGunReadyInvoke({
    attackBranch: 'invented', readyClipPresent: true, requestedDelaySeconds: 1,
  }), /attackBranch/);
  assert.throws(() => planMcdGunReadyInvoke({
    attackBranch: MCD_GUN_ATTACK_BRANCH.FIRE, requestedDelaySeconds: 1,
  }), /readyClipPresent/);
  assert.throws(() => resolveMcdGunReadyCallback(plan(), {
    callbackInvoked: true,
  }), /weaponThrownAtCallback/);
});

test('zero attack delay remains an Invoke request, not proof of immediate playback', () => {
  const request = plan({}, true, 0);
  assert.equal(request.requestedDelaySeconds, 0);
  assert.equal(request.scheduler, 'Unity Invoke');
});
