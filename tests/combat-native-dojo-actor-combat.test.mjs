import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeEnemyState } from '../src/combat/native-enemy-runtime.js';
import { stepNativeDojoActorCombat } from '../src/combat/native-dojo-actor-combat.js';
import { planIncomingBulletFixedContacts } from '../src/combat/incoming-bullet-contacts.js';

const p = (x = 0, y = 0, z = 0) => ({ x, y, z });
// Synthetic fixtures only: NO assertion of active Dojo difficulty or prefab.
const settings = family => ({
  family, attackDelay: .1, alertDelay: .5, projectileSpeed: 28,
  weaponSpeedMultiplier: 1, difficultyWeaponSpeedMultiplier: 1,
  walkingSpeed: 2, runningSpeed: 5, acceleration: 10,
  afterglowDuration: .7, stopAimingTime: .05, alwaysAlert: false,
  ...(family === 'Shotgun' ? { pelletCount: 4 } : {}),
});
const gunInput = {
  targetSight: true, sightMode: 'all-directions', aimTargetInSight: true,
  aimReady: true, weaponInRightPosition: true, allowAttacking: true,
  canShot: true, active: true, animationTarget: p(10),
};
const setup = family => {
  const weaponSettings = settings(family);
  const runtime = createNativeEnemyState(weaponSettings);
  runtime.alertness = 1;
  runtime.attackDelayRemaining = -1;
  return { runtime, weaponSettings };
};
const update = (actorId, state, additions = {}) =>
  stepNativeDojoActorCombat({
    actorId, phase: 'update', ...state,
    scaledDeltaTime: 0, unscaledDeltaTime: 0,
    random: () => .5, ...additions,
  });
const late = (actorId, state, pose) =>
  stepNativeDojoActorCombat({
    actorId, phase: 'late', ...state, pose, random: () => .5,
  });

test('one actor fires in Update, retains pending shot without animation pose, emits after pose, then routes separate fixed collision', () => {
  const state = setup('Pistol');
  const accepted = update('enemy-1', state, { gunInput, shooterPosition: p() });
  assert.equal(accepted.gunDecision.shot, true);
  assert.equal(accepted.pendingShot, true);
  assert.deepEqual(accepted.attackRequests.map(item => item.type), [
    'fire-sfx-request', 'enemy-alert-request',
  ]);
  assert.deepEqual(accepted.animationIntents.map(item => item.kind), ['gun-attack-accepted']);
  const missingPose = late('enemy-1', state, null);
  assert.equal(missingPose.status, 'awaiting-late-pose');
  assert.equal(missingPose.pendingShot, true);
  assert.deepEqual(missingPose.projectileRequests, []);
  const shot = late('enemy-1', state, { muzzlePosition: p(1), weaponForward: p(1) });
  assert.equal(shot.status, 'spawn-requests');
  assert.equal(shot.projectileRequests.length, 1);
  assert.equal(shot.projectileRequests[0].actorId, 'enemy-1');
  assert.equal(shot.projectileRequests[0].type, 'projectile-spawn-request');
  assert.deepEqual(shot.projectileRequests[0].position, p(1));
  assert.equal(shot.pendingShot, false);
  assert.equal(late('enemy-1', state, null).status, 'empty');

  // Preclassified synthetic native CustomCollider contact, not a PhysX sweep.
  const contact = planIncomingBulletFixedContacts({
    orderedHits: [{ layer: 'CustomCollider', ignored: false, hasPlayerController: true }],
    firedByPlayer: false, sniperBullet: false,
    projectilePosition: p(5), velocity: p(10),
  });
  assert.equal(contact.events.at(-1).type, 'player-kill-request');
});

test('shotgun emits one source-qualified gun cue and all deferred pellet requests without a guessed count', () => {
  const state = setup('Shotgun');
  const accepted = update(2, state, { gunInput, shooterPosition: p(3) });
  assert.equal(accepted.attackRequests.filter(r => r.type === 'fire-sfx-request').length, 1);
  const volley = late(2, state, { muzzlePosition: p(2), weaponForward: p(1) });
  assert.equal(volley.projectileRequests.length, state.weaponSettings.pelletCount);
  assert.equal(volley.projectileRequests.filter(r => r.muzzleFlash).length, 1);
  assert.ok(volley.projectileRequests.every(r => r.actorId === 2));
});

test('melee Attack is only an animation intent; even native melee kill decision cannot apply damage without the event/contact gate', () => {
  const state = setup('Melee');
  // Explicit synthetic range (not a Dojo scene setting); no implicit default.
  state.weaponSettings.meleeAttackDistance = 1;
  const meleeInput = {
    active: true, playerAlive: true, inFront: true,
    enemyPosition: p(), playerPosition: p(.2), weaponPosition: p(),
    inPunchAnimation: false, inHitAnimation: false,
    inWeaponAttackAnimation: false, meleeDamage: true,
    meleeWeaponDamage: false, katanaHit: false,
  };
  const result = update('unarmed', state, { meleeInput });
  assert.equal(result.meleeDecision.attack, true);
  assert.equal(result.meleeDecision.kill, true);
  assert.deepEqual(result.animationIntents.map(x => x.kind), ['melee-attack-intent']);
  assert.deepEqual(result.attackRequests, []);
  assert.equal(result.pendingShot, false);
});

test('externally established hit/disarm/death receipts map to actor intents without inventing a bone pose', () => {
  const state = setup('Pistol');
  const result = update('actor-3', state, { reactionActions: [
    { type: 'stun', stunType: 'STUN_THROWABLE', restartAnimation: true },
    { type: 'drop-weapon' }, { type: 'kill', deathSource: 'Throwable' },
  ] });
  assert.deepEqual(result.animationIntents.map(x => x.kind), [
    'hit-reaction-request', 'weapon-detach-request', 'animator-kill-request',
  ]);
  assert.ok(result.animationIntents.every(x => x.actorId === 'actor-3'));
  assert.deepEqual(result.attackRequests, []);
  assert.throws(() => update('actor-3', state, {
    reactionActions: [{ type: 'kill', deathSource: 'Throwable' }],
    gunInput, shooterPosition: p(),
  }), /kill reaction/);
});

test('unqualified weapon family cannot mutate weapon timers or generate fabricated gun projectiles', () => {
  const state = setup('Pistol');
  const before = state.runtime.attackDelayRemaining;
  const unqualified = { ...state, weaponSettings: { ...state.weaponSettings, family: 'MeleeWeapon' } };
  assert.throws(() => update('actor-4', unqualified, { gunInput, shooterPosition: p() }), /no qualified attack/);
  assert.equal(state.runtime.attackDelayRemaining, before);
  state.runtime.pendingShot = { target: p(10), speed: 28 };
  assert.throws(() => late('actor-4', unqualified, { muzzlePosition: p() }), /no qualified attack/);
  assert.ok(state.runtime.pendingShot);
});
