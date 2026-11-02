import test from 'node:test';
import assert from 'node:assert/strict';
import { planEnemyShotgunAttack, planEnemyShotgunLateVolley } from '../src/combat/enemy-shotgun.js';

const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
const fixture = (patch = {}) => ({
  deferredBulletSpawn: true, pelletCount: 6, muzzlePosition: vec(2, 3, 4),
  weaponForward: vec(1), projectileSpeed: 28,
  spreadSamples: Array.from({ length: 6 }, () => vec()),
  extraSpeedFactors: [0, 0, 0, 0, 0], ...patch,
});

test('AI shotgun queues only if IsAttackReady and carries seen state even when blocked', () => {
  assert.deepEqual(planEnemyShotgunAttack({ isAttackReady: false, haveBeenSeen: true, alreadyDeferred: false }), {
    shooterHaveBeenSeen: true, deferredBulletSpawn: false,
    shootHappened: false, soundCallRequested: false,
    onBulletSpawnRequested: false, alertRadius: null,
  });
  const pending = planEnemyShotgunAttack({
    isAttackReady: false, haveBeenSeen: false, alreadyDeferred: true,
  });
  assert.equal(pending.deferredBulletSpawn, true); // non-ready Attack preserves earlier queued shot
  assert.equal(pending.soundCallRequested, false);
  assert.deepEqual(planEnemyShotgunAttack({ isAttackReady: true, haveBeenSeen: false, alreadyDeferred: false }), {
    shooterHaveBeenSeen: false, deferredBulletSpawn: true,
    shootHappened: true, soundCallRequested: true,
    onBulletSpawnRequested: true, alertRadius: 5,
  });
});

test('no pending deferred shot emits nothing, without inventing an active prefab', () => {
  assert.deepEqual(planEnemyShotgunLateVolley({ deferredBulletSpawn: false }), {
    outcome: 'no-pending-shot', clearPendingOnSuccessfulCompletion: false,
    requests: [], pairwiseCollisionExclusions: [],
  });
});

test('source default pelletCount=6 means SIX AI requests, unlike player 1+pelletsCount', () => {
  const attack = planEnemyShotgunAttack({ isAttackReady: true, haveBeenSeen: true, alreadyDeferred: false });
  const result = planEnemyShotgunLateVolley(fixture({
    deferredBulletSpawn: attack.deferredBulletSpawn,
  }));
  assert.equal(result.outcome, 'spawn-requests-planned');
  assert.equal(result.clearPendingOnSuccessfulCompletion, true);
  assert.equal(result.requests.length, 6);
  assert.deepEqual(result.requests.map(r => r.index), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(result.requests.map(r => r.muzzleFlash), [true, false, false, false, false, false]);
  assert.ok(result.requests.every(r => r.speed === 28));
  assert.ok(result.requests.every(r => r.origin.x === 2 && r.origin.y === 3 && r.origin.z === 4));
  assert.equal(result.pairwiseCollisionExclusions.length, 15);
  assert.deepEqual(result.pairwiseCollisionExclusions[0], [0, 1]);
  assert.deepEqual(result.pairwiseCollisionExclusions.at(-1), [4, 5]);
});

test('AI pellets have different native spread scales and ALL are normalized at late spawn', () => {
  const spread = Array.from({ length: 6 }, () => vec());
  spread[0] = vec(0, 1);
  spread[1] = vec(0, 1);
  const result = planEnemyShotgunLateVolley(fixture({ spreadSamples: spread }));
  const [first, second] = result.requests;
  assert.ok(first.direction.y > 0 && second.direction.y > first.direction.y);
  assert.ok(Math.abs(Math.hypot(...Object.values(first.direction)) - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...Object.values(second.direction)) - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...Object.values(first.velocity)) - first.speed) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...Object.values(second.velocity)) - second.speed) < 1e-12);
  assert.deepEqual(spread[0], vec(0, 1));
  assert.deepEqual(spread[1], vec(0, 1));
});

test('only extra AI pellets receive native speed jitter within +/-speed/15', () => {
  const out = planEnemyShotgunLateVolley(fixture({
    extraSpeedFactors: [-1, 1, 0, 0.5, -0.5],
  }));
  assert.equal(out.requests[0].speed, 28);
  assert.equal(out.requests[1].speed, 28 - 28 / 15);
  assert.equal(out.requests[2].speed, 28 + 28 / 15);
  assert.equal(out.requests[3].speed, 28);
  assert.equal(out.requests[4].speed, 28 + 14 / 15);
});

test('pelletCount=1 emits one request and zero collision exclusions', () => {
  const out = planEnemyShotgunLateVolley(fixture({
    pelletCount: 1, spreadSamples: [vec()], extraSpeedFactors: [],
  }));
  assert.equal(out.requests.length, 1);
  assert.deepEqual(out.pairwiseCollisionExclusions, []);
});

test('active prefab values and random samples cannot be guessed', () => {
  assert.throws(() => planEnemyShotgunLateVolley(fixture({ pelletCount: undefined })), TypeError);
  assert.throws(() => planEnemyShotgunLateVolley(fixture({ spreadSamples: [vec()] })), TypeError);
  assert.throws(() => planEnemyShotgunLateVolley(fixture({ extraSpeedFactors: [0] })), TypeError);
  assert.throws(() => planEnemyShotgunLateVolley(fixture({ extraSpeedFactors: [0, 0, 0, 0, 2] })), TypeError);
  assert.throws(() => planEnemyShotgunLateVolley(fixture({ weaponForward: vec() })), RangeError);
  const outsideSphere = Array.from({ length: 6 }, () => vec());
  outsideSphere[2] = vec(2);
  assert.throws(() => planEnemyShotgunLateVolley(fixture({ spreadSamples: outsideSphere })), TypeError);
  assert.throws(() => planEnemyShotgunAttack({ isAttackReady: 1, haveBeenSeen: false, alreadyDeferred: false }), TypeError);
});

test('late pose provides spawn orientation and muzzle, no pre-IK position is assumed', () => {
  const attack = planEnemyShotgunAttack({ isAttackReady: true, haveBeenSeen: false, alreadyDeferred: false });
  const late = planEnemyShotgunLateVolley(fixture({
    deferredBulletSpawn: attack.deferredBulletSpawn,
    muzzlePosition: vec(9, 2, -1), weaponForward: vec(0, 0, -1),
  }));
  assert.equal(late.requests.length, 6);
  assert.ok(late.requests.every(r => r.origin.x === 9 && r.origin.y === 2 && r.origin.z === -1));
  assert.ok(late.requests.every(r => r.direction.z < -0.9999));
  assert.notEqual(late.requests[0].origin.x, 2);
  // Pool availability, Bullet.FixedUpdate, player damage and audio remain unobserved.
});
