import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeEnemyState, runNativeEnemyGunAttack } from '../src/combat/native-enemy-runtime.js';
import { nativeEnemyFireAttackRequests, nativeEnemyFireLateRequests }
  from '../src/combat/native-enemy-fire-phase.js';
import { firstImpact } from '../src/combat/trace.js';

const p = (x = 0, y = 0, z = 0) => ({ x, y, z });
// Synthetic test fixtures. These are NOT measured Dojo difficulty/prefab values.
const config = family => ({
  family, attackDelay: 0.1, alertDelay: 0.5, projectileSpeed: 28,
  weaponSpeedMultiplier: 1, difficultyWeaponSpeedMultiplier: 1,
  walkingSpeed: 2, runningSpeed: 5, acceleration: 10,
  afterglowDuration: 0.7, stopAimingTime: 0.05, alwaysAlert: false,
  ...(family === 'Shotgun' ? { pelletCount: 6 } : {}),
});
function acceptedShot(settings) {
  const state = createNativeEnemyState(settings);
  state.alertness = 1;
  state.attackDelayRemaining = -0.1;
  const actions = runNativeEnemyGunAttack(state, settings, {
    scaledDeltaTime: 0, unscaledDeltaTime: 0,
    targetSight: true, sightMode: 'all-directions',
    aimTargetInSight: true, aimReady: true, weaponInRightPosition: true,
    allowAttacking: true, canShot: true, active: true,
    animationTarget: p(10),
  }, () => 0.5);
  assert.equal(actions.shot, true);
  assert.ok(state.pendingShot);
  return { state, actions };
}

test('Dojo pistol: accepted attack makes sound/alert request BEFORE deferred projectile and regardless of a wall', () => {
  const settings = config('Pistol'), { state, actions } = acceptedShot(settings);
  const effects = nativeEnemyFireAttackRequests(actions, settings.family, p());
  assert.deepEqual(effects, [
    { type: 'fire-sfx-request', family: 'Pistol', position: p() },
    { type: 'enemy-alert-request', family: 'Pistol', position: p(), radius: 10 },
  ]);
  const absentPose = nativeEnemyFireLateRequests(state, settings, null);
  assert.deepEqual(absentPose, { status: 'awaiting-late-pose', requests: [] });
  assert.ok(state.pendingShot, 'missing animated muzzle cannot erase an accepted shot');

  // Independently sampled late muzzle: no render callback or pre-spawn LOS cast.
  const emitted = nativeEnemyFireLateRequests(state, settings, { muzzlePosition: p() });
  assert.equal(emitted.status, 'spawn-requests');
  assert.equal(emitted.requests.length, 1);
  assert.equal(emitted.requests[0].type, 'projectile-spawn-request');
  assert.deepEqual(emitted.requests[0].direction, p(1));
  assert.deepEqual(nativeEnemyFireLateRequests(state, settings, null), {
    status: 'empty', requests: [],
  });

  // Provisional Web geometry illustrates the integration order; it is NOT
  // Unity PhysX or native layer/penetration proof. The wall is hit AFTER emit.
  const target = { center: p(9), radius: 0.5 };
  const wall = { min: p(4, -1, -1), max: p(5, 1, 1) };
  assert.equal(firstImpact(p(), p(10), { solids: [wall], targets: [target] }).kind, 'solid');
  assert.equal(firstImpact(p(), p(10), { targets: [target] }).kind, 'target');
  assert.equal(effects[0].type, 'fire-sfx-request', 'wall contact never revokes the sound request');
});

test('Dojo shotgun: accepted attack and late pose produce the full volley, one fire cue', () => {
  const settings = config('Shotgun'), { state, actions } = acceptedShot(settings);
  const events = nativeEnemyFireAttackRequests(actions, 'Shotgun', p(1, 2, 3));
  assert.equal(events.filter(event => event.type === 'fire-sfx-request').length, 1);
  assert.equal(events.find(event => event.type === 'enemy-alert-request').radius, 5);
  const emitted = nativeEnemyFireLateRequests(state, settings, {
    muzzlePosition: p(2), weaponForward: p(1),
  }, () => 0.5);
  assert.equal(emitted.requests.length, 6, 'AI shotgun count, not player ShotGun 1+pelletsCount');
  assert.equal(emitted.requests.filter(event => event.muzzleFlash).length, 1);
  assert.ok(emitted.requests.every(event => event.position.x === 2));
  assert.equal(state.pendingShot, null);
});

test('unaccepted attack has no fire cue; unsupported family and missing native pose fail closed', () => {
  assert.deepEqual(nativeEnemyFireAttackRequests({ shot: false }, 'Pistol', null), []);
  assert.throws(() => nativeEnemyFireAttackRequests({ shot: true }, 'MachineGun', p()), /not verified/);
  assert.throws(() => nativeEnemyFireAttackRequests({ shot: true }, 'Pistol', null), /position/);
  const settings = config('Shotgun'), { state } = acceptedShot(settings);
  assert.deepEqual(nativeEnemyFireLateRequests(state, settings, {
    muzzlePosition: p(), weaponForward: null,
  }), { status: 'awaiting-late-pose', requests: [] });
  assert.ok(state.pendingShot);
  assert.throws(() => nativeEnemyFireLateRequests({}, settings, null), /pendingShot/);
});
