import assert from 'node:assert/strict';
import test from 'node:test';
import { planBulletFixedContactSequence } from '../src/combat/bullet-fixed-contact-sequence.js';
import { planEnemyShotgunAttack, planEnemyShotgunLateVolley } from '../src/combat/enemy-shotgun.js';
import { advanceBulletUpdate } from '../src/combat/shot-phases.js';

const v = (x, y = 0, z = 0) => ({ x, y, z });
const current = {
  shotId: 7, shotgunPellet: false, didRicochet: false, deflected: false,
  firedByPlayer: false, sniperBullet: false, forward: v(1),
};
const encountered = {
  shotId: 8, shotgunPellet: false, didRicochet: false, deflected: false,
  firedByPlayer: true, sniperBullet: false, forward: v(-1),
};
const player = {
  layer: 'CustomCollider', ignored: false, hasPlayerController: true,
  destroyedAfterHandler: false,
};
const wall = {
  layer: 'Environment', ignored: false, destroyedAfterHandler: false,
};
const pairHit = {
  layer: 'Bullets', ignored: false, encountered, collisionPoint: v(2, 2, 1),
  otherCanCollideCurrent: true, destroyedAfterHandler: false,
};

const plan = (orderedHits, overrides = {}) => planBulletFixedContactSequence({
  orderedHits, current, projectilePosition: v(6, 2, 1),
  velocity: v(36), ...overrides,
});

test('synthetic AI shotgun shot passes pair-slice REQUEST then reaches PlayerController when not destroyed', () => {
  const ready = planEnemyShotgunAttack({
    isAttackReady: true, haveBeenSeen: true, alreadyDeferred: false,
  });
  const volley = planEnemyShotgunLateVolley({
    deferredBulletSpawn: ready.deferredBulletSpawn,
    pelletCount: 1, muzzlePosition: v(0, 2, 1),
    weaponForward: v(1), projectileSpeed: 36,
    spreadSamples: [v(0)], extraSpeedFactors: [],
  });
  assert.equal(volley.requests.length, 1);
  const moved = advanceBulletUpdate({
    position: volley.requests[0].origin,
    velocity: volley.requests[0].velocity,
  }, 0.2);
  const result = plan([pairHit, player], {
    projectilePosition: moved.bullet.position,
    velocity: moved.bullet.velocity,
  });
  assert.equal(result.status, 'native-loop-stop-requested');
  assert.equal(result.stoppedAt, 1);
  assert.equal(result.events.filter(e => e.type === 'slice-request').length, 2);
  assert.equal(result.events.filter(e => e.type === 'alert-request').length, 3);
  assert.equal(result.events.some(e => e.type === 'player-kill-request'), true);
  // All effects above are command requests; no native hit or death observed.
});

test('post-slice destroyed state stops the native loop before the player contact', () => {
  const result = plan([{ ...pairHit, destroyedAfterHandler: true }, player]);
  assert.equal(result.status, 'native-loop-stop-requested');
  assert.equal(result.stoppedAt, 0);
  assert.equal(result.events.some(e => e.type === 'player-kill-request'), false);
});

test('unknown post-slice destruction blocks later kill inference', () => {
  const { destroyedAfterHandler, ...unverified } = pairHit;
  const result = plan([unverified, player]);
  assert.equal(result.status, 'destruction-state-unverified');
  assert.equal(result.consumedHits, 1);
  assert.equal(result.events.some(e => e.type === 'player-kill-request'), false);
});

test('unverified other.CanCollide blocks contact continuation', () => {
  const { otherCanCollideCurrent, ...unknown } = pairHit;
  const result = plan([unknown, player]);
  assert.equal(result.status, 'pair-can-collide-unverified');
  assert.equal(result.events.some(e => e.type === 'slice-request'), false);
  assert.equal(result.events.some(e => e.type === 'player-kill-request'), false);
});

test('same-shot pellets are ignored, but later player contact is considered', () => {
  const result = plan([{
    ...pairHit,
    encountered: { ...current, shotgunPellet: true },
  }, player], { current: { ...current, shotgunPellet: true } });
  assert.equal(result.stoppedAt, 1);
  assert.equal(result.events.some(e => e.type === 'slice-request'), false);
  assert.equal(result.events.some(e => e.type === 'player-kill-request'), true);
});

test('ignored collider does not alert; an environment collision stops ordinary bullet', () => {
  const result = plan([{ ...wall, ignored: true }, wall, player]);
  assert.equal(result.stoppedAt, 1);
  assert.equal(result.events.filter(e => e.type === 'alert-request').length, 1);
  assert.equal(result.events.some(e => e.type === 'player-kill-request'), false);
});

test('unmodeled Enemies layer stops inference instead of skipping a possible native reaction', () => {
  const result = plan([{
    layer: 'Enemies', ignored: false, destroyedAfterHandler: false,
  }, player]);
  assert.equal(result.status, 'unmodeled-native-layer');
  assert.equal(result.stoppedAt, 0);
  assert.equal(result.events.some(e => e.type === 'player-kill-request'), false);
});

test('sniper can continue handled environment only if post-handler destruction explicitly false', () => {
  const result = plan([wall, player], { current: { ...current, sniperBullet: true } });
  assert.equal(result.status, 'contacts-exhausted');
  assert.equal(result.events.some(e => e.type === 'player-kill-request'), true);
  const blocked = plan([{ ...wall, destroyedAfterHandler: true }, player], {
    current: { ...current, sniperBullet: true },
  });
  assert.equal(blocked.stoppedAt, 0);
  assert.equal(blocked.events.some(e => e.type === 'player-kill-request'), false);
});

test('missing hit guards and flags cannot silently become a valid contact', () => {
  assert.throws(() => plan([{ layer: 'Bullets', ignored: 0 }]), /explicit/);
  assert.throws(() => plan([player], { current: { ...current, firedByPlayer: 0 } }), /explicit/);
});
