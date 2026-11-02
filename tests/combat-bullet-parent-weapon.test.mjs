import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canEncounteredBulletCollideWithCurrent,
  planBulletPairContact,
} from '../src/combat/bullet-pair-contacts.js';
import { planBulletFixedContactSequence } from '../src/combat/bullet-fixed-contact-sequence.js';
import { planEnemyShotgunAttack, planEnemyShotgunLateVolley } from '../src/combat/enemy-shotgun.js';
import { advanceBulletUpdate } from '../src/combat/shot-phases.js';

const v = (x = 0, y = 0, z = 1) => ({ x, y, z });
const bullet = (fields = {}) => ({
  shotgunPellet: false, shotId: 10, didRicochet: false,
  deflected: false, firedByPlayer: false, sniperBullet: false,
  forward: v(), ...fields,
});
const pair = (current, encountered, otherCanCollideCurrent) =>
  planBulletPairContact({
    ignored: false, current, encountered,
    collisionPoint: v(2, 2, 2), otherCanCollideCurrent,
  });

test('native other.CanCollide(current) rejects identical nonzero parent weapon IDs', () => {
  assert.equal(canEncounteredBulletCollideWithCurrent({
    currentParentWeaponId: 42, encounteredParentWeaponId: 42,
  }), false);
  assert.equal(pair(bullet({ parentWeaponId: 42, shotId: 10 }),
    bullet({ parentWeaponId: 42, shotId: 11 })).outcome,
  'other-can-collide-rejected');
});

test('native guard permits different nonzero IDs, including negative Unity instance IDs', () => {
  assert.equal(canEncounteredBulletCollideWithCurrent({
    currentParentWeaponId: -42, encounteredParentWeaponId: -43,
  }), true);
  const result = pair(bullet({ parentWeaponId: 42 }),
    bullet({ parentWeaponId: 41, shotId: 11 }));
  assert.equal(result.outcome, 'bullet-pair-contact-requests');
  assert.equal(result.events.filter(event => event.type === 'slice-request').length, 2);
  assert.equal(result.nativeHandlerReturn, false);
  assert.equal(result.requiresDestroyedProbe, true);
});

test('zero override belongs to encountered receiver, not current bullet', () => {
  const receiverZero = pair(bullet({ parentWeaponId: 77 }),
    bullet({ parentWeaponId: 0, shotId: 11 }));
  const currentZero = pair(bullet({ parentWeaponId: 0 }),
    bullet({ parentWeaponId: 77, shotId: 11 }));
  assert.equal(receiverZero.outcome, 'bullet-pair-contact-requests');
  assert.equal(currentZero.outcome, 'bullet-pair-contact-requests');
  assert.equal(canEncounteredBulletCollideWithCurrent({
    currentParentWeaponId: 0, encounteredParentWeaponId: 0,
  }), true);
});

test('missing fields are never treated as zero, and legacy observed bool remains possible', () => {
  const current = bullet({ parentWeaponId: 5 });
  const encountered = bullet({ shotId: 11 });
  assert.equal(pair(current, encountered).outcome, 'parent-weapon-ids-incomplete');
  assert.equal(pair(bullet(), encountered).outcome, 'other-can-collide-unverified');
  assert.equal(pair(bullet(), encountered, false).outcome, 'other-can-collide-rejected');
});

test('contradictory explicit CanCollide observation blocks effect requests', () => {
  const current = bullet({ parentWeaponId: 9 });
  const encountered = bullet({ parentWeaponId: 9, shotId: 11 });
  const result = pair(current, encountered, true);
  assert.equal(result.outcome, 'parent-weapon-guard-conflict');
  assert.deepEqual(result.events.map(event => event.type), ['alert-request']);
  assert.equal(result.requiresDestroyedProbe, false);
});

test('invalid or synthetic non-int32 weapon IDs are not accepted as native instance IDs', () => {
  for (const value of [undefined, null, 1.5, 2147483648, -2147483649, Infinity, '42']) {
    assert.throws(() => canEncounteredBulletCollideWithCurrent({
      currentParentWeaponId: 42, encounteredParentWeaponId: value,
    }), TypeError);
  }
});

test('source-bounded synthetic enemy shotgun → Update → FixedUpdate pair guard → player kill REQUEST', () => {
  const intent = planEnemyShotgunAttack({
    isAttackReady: true, haveBeenSeen: true, alreadyDeferred: false,
  });
  const late = planEnemyShotgunLateVolley({
    deferredBulletSpawn: intent.deferredBulletSpawn,
    pelletCount: 1, muzzlePosition: v(0, 2, 1), weaponForward: v(1, 0, 0),
    projectileSpeed: 36, spreadSamples: [v(0, 0, 0)], extraSpeedFactors: [],
  });
  assert.equal(late.requests.length, 1);
  const moved = advanceBulletUpdate({
    position: late.requests[0].origin, velocity: late.requests[0].velocity,
  }, 0.2);
  const current = bullet({ parentWeaponId: -100, forward: v(1, 0, 0) });
  const encountered = bullet({
    parentWeaponId: -101, shotId: 11, firedByPlayer: true, forward: v(-1, 0, 0),
  });
  const result = planBulletFixedContactSequence({
    current, projectilePosition: moved.bullet.position, velocity: moved.bullet.velocity,
    orderedHits: [
      { layer: 'Bullets', ignored: false, encountered,
        collisionPoint: v(2, 2, 1), destroyedAfterHandler: false },
      { layer: 'CustomCollider', ignored: false, hasPlayerController: true,
        destroyedAfterHandler: false },
    ],
  });
  assert.equal(result.status, 'native-loop-stop-requested');
  assert.equal(result.stoppedAt, 1);
  assert.equal(result.events.filter(event => event.type === 'slice-request').length, 2);
  assert.equal(result.events.some(event => event.type === 'player-kill-request'), true);
  // These are planned commands over injected contacts, not a native PhysX trace
  // or actual player death; post-SliceInHalf destruction is explicitly injected.
});

test('same-weapon pair emits no slices and subsequent player request is still considered', () => {
  const current = bullet({ parentWeaponId: -100 });
  const result = planBulletFixedContactSequence({
    current, projectilePosition: v(3), velocity: v(36, 0, 0),
    orderedHits: [
      { layer: 'Bullets', ignored: false,
        encountered: bullet({ parentWeaponId: -100, shotId: 11 }),
        collisionPoint: v(2), destroyedAfterHandler: false },
      { layer: 'CustomCollider', ignored: false, hasPlayerController: true,
        destroyedAfterHandler: false },
    ],
  });
  assert.equal(result.stoppedAt, 1);
  assert.equal(result.events.some(event => event.type === 'slice-request'), false);
  assert.equal(result.events.some(event => event.type === 'player-kill-request'), true);
});

test('FixedUpdate composition refuses incomplete or contradictory owner evidence', () => {
  const current = bullet({ parentWeaponId: 5 });
  const base = {
    layer: 'Bullets', ignored: false, collisionPoint: v(2),
    destroyedAfterHandler: false,
  };
  const next = {
    layer: 'CustomCollider', ignored: false, hasPlayerController: true,
    destroyedAfterHandler: false,
  };
  const plan = first => planBulletFixedContactSequence({
    current, projectilePosition: v(3), velocity: v(36),
    orderedHits: [first, next],
  });
  const partial = plan({ ...base, encountered: bullet({ shotId: 11 }) });
  assert.equal(partial.status, 'parent-weapon-ids-incomplete');
  assert.equal(partial.events.some(event => event.type === 'player-kill-request'), false);
  const conflict = plan({ ...base,
    encountered: bullet({ parentWeaponId: 5, shotId: 11 }),
    otherCanCollideCurrent: true,
  });
  assert.equal(conflict.status, 'parent-weapon-guard-conflict');
  assert.equal(conflict.events.some(event => event.type === 'player-kill-request'), false);
});
