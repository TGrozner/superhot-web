import test from 'node:test';
import assert from 'node:assert/strict';
import { beginPistolFire, advanceBulletUpdate, traceBulletFixedStep,
  classifyOrdinaryEnemyImpact, shotgunProjectileCount } from '../src/combat/shot-phases.js';

const v = (x, y = 0, z = 0) => ({ x, y, z });
const standard = { alive: true, ownOwner: false, armored: false, concrete: false,
  boss: false, specialEffect: false };
const ready = { canPlayerAttack: true, isWeaponReady: true,
  additionalShootingCheck: true, isThrown: false, noShooting: false };

test('one scoped pistol encounter: fire -> Update motion -> FixedUpdate contact -> kill request', () => {
  // sharedassets0.assets:4849 contains five rounds and a bullet speed of 36.
  // This is decoded prefab data, NOT proof that the prefab was instantiated.
  const enemy = { center: v(5), radius: 0.5, id: 'enemy-1' };
  const fire = beginPistolFire({ ...ready, ammo: 5, spawnPosition: v(0),
    direction: v(1), speed: 36 });
  assert.equal(fire.outcome, 'fired');
  assert.equal(fire.ammo, 4);
  assert.equal(fire.bullet.firedByPlayer, true);
  assert.deepEqual(fire.bullet.velocity, v(36));

  const updated = advanceBulletUpdate(fire.bullet, 0.2);
  assert.deepEqual(updated.sweep.from, v(0));
  assert.deepEqual(updated.sweep.to, v(7.2));
  assert.equal(enemy.id, 'enemy-1'); // movement alone has no hit/reaction.

  const impact = traceBulletFixedStep(updated.sweep, { targets: [enemy] });
  assert.equal(impact?.kind, 'target');
  assert.equal(impact.entity, enemy);
  const resolved = classifyOrdinaryEnemyImpact({ impact, collider: enemy,
    targetId: enemy.id, guards: standard });
  assert.deepEqual(resolved, { outcome: 'kill-requested', command: {
    type: 'kill-enemy', targetId: 'enemy-1', deathSource: 'Bullet',
  } });
});

test('solid occlusion prevents the ordinary enemy kill command', () => {
  const enemy = { center: v(5), radius: 0.5 };
  const fire = beginPistolFire({ ...ready, ammo: 5, spawnPosition: v(0),
    direction: v(1), speed: 36 });
  const { sweep } = advanceBulletUpdate(fire.bullet, 0.2);
  const impact = traceBulletFixedStep(sweep, { targets: [enemy],
    solids: [{ min: v(2, -1, -1), max: v(2.2, 1, 1) }] });
  assert.equal(impact?.kind, 'solid');
  assert.deepEqual(classifyOrdinaryEnemyImpact({ impact, collider: enemy,
    targetId: 'enemy-1', guards: standard }), { outcome: 'no-target-hit', command: null });
});

test('native exceptional branches remain explicitly outside the simple kill scenario', () => {
  const target = { id: 'boss' };
  const impact = { kind: 'target', entity: target };
  for (const key of ['armored', 'concrete', 'boss', 'ownOwner', 'specialEffect']) {
    assert.deepEqual(classifyOrdinaryEnemyImpact({ impact, collider: target,
      targetId: target.id, guards: { ...standard, [key]: true } }),
      { outcome: 'unmodeled-protected-target', command: null });
  }
  assert.throws(() => classifyOrdinaryEnemyImpact({ impact, collider: target,
    targetId: target.id, guards: { alive: true } }), TypeError);
});

test('readiness, NoShooting and empty-click are not treated like successful pistol shots', () => {
  const input = { ...ready, ammo: 5, spawnPosition: v(0), direction: v(1), speed: 36 };
  assert.deepEqual(beginPistolFire({ ...input, isWeaponReady: false }),
    { outcome: 'blocked', ammo: 5, bullet: null });
  assert.deepEqual(beginPistolFire({ ...input, noShooting: true }),
    { outcome: 'unmodeled-throw-instead', ammo: 5, bullet: null });
  assert.deepEqual(beginPistolFire({ ...input, ammo: 0 }),
    { outcome: 'unmodeled-empty-click', ammo: 0, bullet: null });
});

test('scaled movement and directional magnitude stay separate from contact processing', () => {
  const fire = beginPistolFire({ ...ready, ammo: 2, spawnPosition: v(0),
    direction: v(2), speed: 36 });
  assert.deepEqual(fire.bullet.velocity, v(72)); // launch does not normalize.
  const paused = advanceBulletUpdate(fire.bullet, 0);
  assert.deepEqual(paused.bullet.position, v(0));
  assert.deepEqual(advanceBulletUpdate(paused.bullet, 0.1).bullet.position, v(7.2));
  assert.throws(() => advanceBulletUpdate(fire.bullet, -0.1), RangeError);
});

test('decoded ShotGun instance pelletsCount=8 implies nine projectiles, not twelve or eight', () => {
  // sharedassets0.assets:4850 (candidate prefab, not active-level binding).
  assert.equal(shotgunProjectileCount(8), 9);
  assert.equal(shotgunProjectileCount(0), 1);
  assert.throws(() => shotgunProjectileCount(-1), RangeError);
});
