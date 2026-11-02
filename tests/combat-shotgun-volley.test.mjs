import test from 'node:test';
import assert from 'node:assert/strict';
import { planShotgunVolley } from '../src/combat/shotgun-volley.js';
import { advanceBulletUpdate, traceBulletFixedStep,
  classifyOrdinaryEnemyImpact } from '../src/combat/shot-phases.js';

const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
const ready = { canPlayerAttack: true, isWeaponReady: true,
  additionalShootingCheck: true, isThrown: false, noShooting: false };
const fixture = (patch = {}) => ({
  readiness: { ...ready }, ammo: 2, pelletsCount: 8, bulletSpeed: 36,
  aimDirection: v(1), origins: Array.from({ length: 9 }, () => v()),
  samples: Array.from({ length: 9 }, () => v()), ...patch,
});

test('candidate ShotGun/4850: one trigger consumes one round but emits nine projectiles', () => {
  const result = planShotgunVolley(fixture());
  assert.equal(result.outcome, 'fired');
  assert.equal(result.ammo, 1);
  assert.equal(result.bullets.length, 9); // 1 + serialized pelletsCount=8
  assert.equal(result.bullets[0].velocity.x, 36 * 1.16);
  for (const bullet of result.bullets.slice(1)) {
    assert.deepEqual(bullet.velocity, v(36));
  }
  assert.deepEqual(result.bullets.map(b => b.pelletIndex), [0,1,2,3,4,5,6,7,8]);
});

test('primary and extra pellets use different spread scales, without post-normalization', () => {
  const samples = Array.from({ length: 9 }, () => v());
  samples[0] = v(0, 1, 0);
  samples[2] = v(0, 1, 0);
  const result = planShotgunVolley(fixture({ samples }));
  assert.equal(result.bullets[0].velocity.y, 36 / 35);
  assert.equal(result.bullets[2].velocity.y, 36 * 2 / 15);
  assert.ok(Math.hypot(...Object.values(result.bullets[0].velocity)) > 36);
  assert.ok(Math.hypot(...Object.values(result.bullets[2].velocity)) > 36);
  assert.deepEqual(samples[2], v(0, 1, 0)); // no input mutation
});

test('un-normalized extra input is preserved; primary uses normalized aim before spread', () => {
  const result = planShotgunVolley(fixture({ aimDirection: v(2) }));
  assert.equal(result.bullets[0].velocity.x, 36 * 1.16);
  assert.equal(result.bullets[1].velocity.x, 72);
});

test('native exceptional gates never fake bullet emission or ammunition refill', () => {
  for (const key of ['canPlayerAttack', 'isWeaponReady', 'additionalShootingCheck']) {
    const out = planShotgunVolley(fixture({ readiness: { ...ready, [key]: false } }));
    assert.deepEqual(out, { outcome: 'blocked', ammo: 2, bullets: [] });
  }
  assert.equal(planShotgunVolley(fixture({ readiness: { ...ready, isThrown: true } })).outcome,
    'blocked');
  assert.equal(planShotgunVolley(fixture({ readiness: { ...ready, noShooting: true } })).outcome,
    'unmodeled-throw-instead');
  assert.deepEqual(planShotgunVolley(fixture({ ammo: 0 })),
    { outcome: 'unmodeled-empty-shotgun', ammo: 0, bullets: [] });
});

test('scene bindings and per-pellet input must be supplied, never invented', () => {
  assert.throws(() => planShotgunVolley(fixture({ origins: [v()] })), TypeError);
  assert.throws(() => planShotgunVolley(fixture({ samples: [v()] })), TypeError);
  assert.throws(() => planShotgunVolley(fixture({ aimDirection: v() })), RangeError);
  assert.throws(() => planShotgunVolley(fixture({ bulletSpeed: Infinity })), TypeError);
  assert.throws(() => planShotgunVolley(fixture({ pelletsCount: -1 })), RangeError);
});

test('nine-pellet plan can be stepped and hit an ordinary target, or blocked by a wall', () => {
  // Pure Web vertical fixture, NOT native scene coordinates nor PhysX SphereCast.
  const volley = planShotgunVolley(fixture());
  const target = { center: v(5), radius: 0.5, id: 'synthetic-target' };
  const { sweep } = advanceBulletUpdate(volley.bullets[0], 0.2);
  const hit = traceBulletFixedStep(sweep, { targets: [target] });
  assert.equal(hit?.entity, target);
  const guards = { alive: true, ownOwner: false, armored: false,
    concrete: false, boss: false, specialEffect: false };
  assert.equal(classifyOrdinaryEnemyImpact({ impact: hit, collider: target,
    targetId: target.id, guards }).command?.type, 'kill-enemy');
  const stopped = traceBulletFixedStep(sweep, { targets: [target], solids: [
    { min: v(2, -1, -1), max: v(3, 1, 1) },
  ] });
  assert.equal(stopped?.kind, 'solid');
  assert.equal(classifyOrdinaryEnemyImpact({ impact: stopped, collider: target,
    targetId: target.id, guards }).command, null);
});
