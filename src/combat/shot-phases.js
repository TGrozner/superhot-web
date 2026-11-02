import { firstImpact } from './trace.js';

const point = (v) => v && typeof v === 'object' &&
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const copyPoint = ({ x, y, z }) => ({ x, y, z });

/**
 * An explicitly scoped, single-projectile PistolGun path.
 * Callers must derive readiness, permissions, muzzle and aim from the active
 * weapon/profile. This module does not invent those native scene bindings.
 */
export function beginPistolFire({
  canPlayerAttack, isWeaponReady, additionalShootingCheck, isThrown, noShooting,
  ammo, spawnPosition, direction, speed,
}) {
  for (const [name, value] of Object.entries({
    canPlayerAttack, isWeaponReady, additionalShootingCheck, isThrown, noShooting,
  })) {
    if (typeof value !== 'boolean') throw new TypeError(name + ' must be boolean');
  }
  if (!Number.isSafeInteger(ammo) || ammo < 0) {
    throw new RangeError('ammo must be a nonnegative integer');
  }
  if (!point(spawnPosition) || !point(direction) || !Number.isFinite(speed) || speed < 0) {
    throw new TypeError('spawnPosition, direction and speed must be finite');
  }
  if (!canPlayerAttack || !isWeaponReady || !additionalShootingCheck || isThrown) {
    return { outcome: 'blocked', ammo, bullet: null };
  }
  if (noShooting) {
    return { outcome: 'unmodeled-throw-instead', ammo, bullet: null };
  }
  if (ammo === 0) {
    return { outcome: 'unmodeled-empty-click', ammo, bullet: null };
  }
  const velocity = {
    x: direction.x * speed,
    y: direction.y * speed,
    z: direction.z * speed,
  };
  if (!point(velocity)) throw new RangeError('derived bullet velocity must be finite');
  return {
    outcome: 'fired', ammo: ammo - 1,
    bullet: { position: copyPoint(spawnPosition), velocity, firedByPlayer: true },
  };
}

/** Bullet.Update-like translation only. Deliberately no collision in this phase. */
export function advanceBulletUpdate(bullet, scaledDeltaTime) {
  if (!Number.isFinite(scaledDeltaTime) || scaledDeltaTime < 0) {
    throw new RangeError('scaledDeltaTime must be finite and nonnegative');
  }
  if (!point(bullet?.position) || !point(bullet?.velocity)) {
    throw new TypeError('bullet needs finite position and velocity');
  }
  const from = copyPoint(bullet.position);
  const to = {
    x: from.x + bullet.velocity.x * scaledDeltaTime,
    y: from.y + bullet.velocity.y * scaledDeltaTime,
    z: from.z + bullet.velocity.z * scaledDeltaTime,
  };
  if (!point(to)) throw new RangeError('updated bullet position must be finite');
  return {
    bullet: { ...bullet, position: to, velocity: copyPoint(bullet.velocity) },
    sweep: { from, to },
  };
}

/**
 * FixedUpdate-phase adapter for the existing Web segment trace.
 * This is NOT Unity Physics.SphereCast (radius, layers and PhysX differ).
 */
export function traceBulletFixedStep(sweep, geometry) {
  if (!sweep || !point(sweep.from) || !point(sweep.to)) {
    throw new TypeError('sweep requires finite from/to positions');
  }
  return firstImpact(sweep.from, sweep.to, geometry);
}

/**
 * Restrict the source-described Bullet -> PejAiBody.Kill(Bullet) branch to an
 * ordinary, live, unarmored, non-concrete, non-boss, non-owner body target.
 * Returns a request, not a rendered animation or an HP subtraction.
 */
export function classifyOrdinaryEnemyImpact({ impact, collider, targetId, guards }) {
  if (!impact || impact.kind !== 'target' || impact.entity !== collider) {
    return { outcome: 'no-target-hit', command: null };
  }
  if (!guards || typeof guards !== 'object') {
    throw new TypeError('explicit enemy guards are required');
  }
  const keys = ['alive', 'ownOwner', 'armored', 'concrete', 'boss', 'specialEffect'];
  for (const key of keys) {
    if (typeof guards[key] !== 'boolean') {
      throw new TypeError('guards.' + key + ' must be boolean');
    }
  }
  if (!guards.alive || guards.ownOwner || guards.armored || guards.concrete ||
      guards.boss || guards.specialEffect) {
    return { outcome: 'unmodeled-protected-target', command: null };
  }
  if (typeof targetId !== 'string' || targetId.length === 0) {
    throw new TypeError('targetId must be a nonempty string');
  }
  return {
    outcome: 'kill-requested',
    command: { type: 'kill-enemy', targetId, deathSource: 'Bullet' },
  };
}

/** Fire on ShotGun creates one primary projectile PLUS pelletsCount extras. */
export function shotgunProjectileCount(pelletsCount) {
  if (!Number.isSafeInteger(pelletsCount) || pelletsCount < 0 ||
      pelletsCount === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('pelletsCount must be a safe nonnegative integer');
  }
  return pelletsCount + 1;
}
