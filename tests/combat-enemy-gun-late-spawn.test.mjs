import test from 'node:test';
import assert from 'node:assert/strict';
import { planEnemyBaseGunAttack, planEnemyBaseGunLateSpawn } from '../src/combat/enemy-gun-late-spawn.js';
import { planPejAiGunAttackTick } from '../src/combat/ai-gun-attack-branch.js';
import { planBulletFixedContactSequence } from '../src/combat/bullet-fixed-contact-sequence.js';

const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
const attack = overrides => planEnemyBaseGunAttack({
  weaponType: 'GunPejAiWeapon', attackCalled: true,
  isAttackReady: true, pendingBefore: false, haveBeenSeen: true,
  ...overrides,
});
const late = overrides => planEnemyBaseGunLateSpawn({
  weaponType: 'GunPejAiWeapon', latePhaseEntered: true, pending: true,
  deferredTarget: vec(10, 2, 0), deferredSpeed: -1,
  projectileSpeed: 36, lateMuzzle: vec(1, 2, 0),
  poolAcquired: true, bulletComponentPresent: true, bulletColliderPresent: true,
  hasOwnerBodyPart: true, hasWeaponCollider: true,
  hasMuzzleFlashPrefab: true, shooterHaveBeenSeen: true,
  ...overrides,
});

test('ready base gun queues a late bullet but requests FireSfx at Attack time', () => {
  const out = attack();
  assert.equal(out.pendingAfterAttack, true);
  assert.equal(out.fireSfxCallRequested, true);
  assert.equal(out.fireSfxCallVolumeArgument, .4);
  assert.equal(out.projectileEmitted, null);
  assert.equal(out.onBulletSpawnCallbackRequested, true);
  assert.equal(out.alertRadiusRequested, 10);
});

test('unready Attack changes shooter seen flag but does not queue/sound/reload', () => {
  const out = attack({ isAttackReady: false, haveBeenSeen: false });
  assert.equal(out.pendingAfterAttack, false);
  assert.equal(out.shooterHaveBeenSeenAssignment, false);
  assert.equal(out.fireSfxCallRequested, false);
  assert.equal(out.resetAttackDelayRequested, false);
});

test('failed second Attack does not erase an earlier deferred shot', () => {
  assert.equal(attack({ isAttackReady: false, pendingBefore: true }).pendingAfterAttack, true);
  assert.equal(attack({ attackCalled: false, pendingBefore: true }).pendingAfterAttack, true);
});

test('source-gated base gun is not silently applied to shotgun or unknown class', () => {
  assert.equal(attack({ weaponType: null }).status, 'weapon-type-unverified');
  assert.equal(late({ weaponType: 'ShotGunPejAiWeapon' }).status, 'weapon-type-unverified');
});

test('the phase must be independently observed before deferred spawn', () => {
  assert.equal(late({ latePhaseEntered: null }).status, 'late-phase-unverified');
  const out = late({ latePhaseEntered: false });
  assert.equal(out.status, 'deferred-until-phase');
  assert.equal(out.pendingClearsOnNormalReturn, false);
});

test('the source has NO muzzle-to-target occlusion gate; spawn uses late muzzle', () => {
  const ordinary = late({ lateMuzzle: vec(2, 3, -1) });
  const behindWall = late({ lateMuzzle: vec(2, 3, -1), obstacleBetweenMuzzleAndTarget: true });
  assert.deepEqual(ordinary, behindWall);
  assert.equal(ordinary.launchRequested, true);
  assert.deepEqual(ordinary.request.origin, vec(2, 3, -1));
  assert.ok(ordinary.request.direction.x > 0);
  assert.equal(ordinary.request.muzzleFlashRequested, true);
  assert.equal(ordinary.request.ignoreWeaponCollider, true);
});

test('Pooler miss STILL clears pending on normal return; earlier sound is independent', () => {
  const fired = attack();
  const out = late({ pending: fired.pendingAfterAttack, poolAcquired: false });
  assert.equal(fired.fireSfxCallRequested, true);
  assert.equal(out.status, 'pool-miss');
  assert.equal(out.pendingClearsOnNormalReturn, true);
  assert.equal(out.launchRequested, false);
});

test('unknown Pooler result must not be promoted to a bullet launch', () => {
  const out = late({ poolAcquired: null });
  assert.equal(out.status, 'pool-result-unverified');
  assert.equal(out.launchRequested, false);
  assert.equal(out.pendingClearsOnNormalReturn, true);
});

test('missing native bullet components cannot claim normal successful launch', () => {
  assert.equal(late({ bulletComponentPresent: null }).status, 'source-component-unverified');
  assert.equal(late({ bulletColliderPresent: false }).status, 'source-component-missing');
});

test('deferred speed sentinel and owner/flash switches are explicit and independent', () => {
  const result = late({ deferredSpeed: 24, projectileSpeed: 36,
    hasOwnerBodyPart: false, hasWeaponCollider: false, hasMuzzleFlashPrefab: false });
  assert.equal(result.request.speed, 24);
  assert.equal(result.request.setOwnerFromBodyPart, false);
  assert.equal(result.request.ignoreWeaponCollider, false);
  assert.equal(result.request.muzzleFlashRequested, false);
  assert.ok(Math.abs(Math.hypot(...Object.values(result.request.velocity)) - 24) < 1e-10);
});

test('degenerate late shot orientation is unknown, never a guessed axis', () => {
  assert.equal(late({ deferredTarget: vec(1, 2, 0), lateMuzzle: vec(1, 2, 0) }).status,
    'degenerate-look-direction-unverified');
});

test('invalid active inputs fail instead of inventing source runtime values', () => {
  assert.throws(() => attack({ isAttackReady: 1 }), /explicit boolean/);
  assert.throws(() => late({ projectileSpeed: undefined }), /live finite/);
  assert.throws(() => late({ deferredTarget: { x: NaN, y: 1, z: 0 } }), /finite xyz/);
});

test('synthetic end-to-end source chain: AI Attack -> late bullet -> wall OR player contact', () => {
  const decision = planPejAiGunAttackTick({
    canSeePlayer360: true, aimTargetInSight: true, targetRerollReady: true,
    weaponPositionReady: true, timeToReady: 0, stopAimingTime: .1,
    weaponAttackReady: true, inMiddleOfSeries: false, aimTargetReady: true,
  });
  assert.equal(decision.attackRequested, true);
  const weapon = attack({ attackCalled: decision.attackRequested });
  assert.equal(weapon.fireSfxCallRequested, true);
  const emitted = late({ pending: weapon.pendingAfterAttack });
  assert.equal(emitted.launchRequested, true);
  const base = {
    current: { firedByPlayer: false, sniperBullet: false },
    projectilePosition: emitted.request.origin,
    velocity: emitted.request.velocity,
  };
  const wall = planBulletFixedContactSequence({
    ...base,
    orderedHits: [
      { layer: 'Environment', ignored: false, destroyedAfterHandler: false },
      { layer: 'CustomCollider', ignored: false, hasPlayerController: true,
        destroyedAfterHandler: false },
    ],
  });
  assert.equal(wall.status, 'native-loop-stop-requested');
  assert.equal(wall.stoppedAt, 0);
  assert.ok(wall.events.some(e => e.type === 'environment-handler-request'));
  assert.ok(!wall.events.some(e => e.type === 'player-kill-request'));
  const clearPath = planBulletFixedContactSequence({
    ...base, orderedHits: [
      { layer: 'CustomCollider', ignored: false, hasPlayerController: true,
        destroyedAfterHandler: false },
    ],
  });
  assert.ok(clearPath.events.some(e => e.type === 'player-kill-request'));
  // Synthetic, source-bounded event requests only; no actual frame, Pooler or damage.
});
